#!/usr/bin/env node
import { Page, webkit } from 'playwright';
import fs from 'fs';
const config = require('./config.json');

async function app() {
  var myArgs = process.argv.slice(2);
  if (myArgs.length === 0) {
    // When no arguments are passed then we use the evaluate.json file as a list of stocks to evaluate.
    const path = `${config.path}`;
    const evaluationList = require(`${path}/evaluate.json`);

    console.log('Evaluating stocks from evaluate.json');

    for (const evaluate of evaluationList.evaluate) {
      await evaluateStock(evaluate.Symbol, evaluate.OverrideGrowth);
    }
    return;
  }

  const symbol = myArgs[0];
  const overrideGrowth = myArgs[1];

  await evaluateStock(symbol, overrideGrowth);
}

async function evaluateStock(
  symbol: string,
  overrideGrowth?: string
): Promise<void> {
  console.log('Procesing stock ' + symbol);
  const path = `${config.path}/Evaluation/${symbol}`;

  const requiredPaths = [path, `${path}/05-mos`];

  const nowDate = new Date();
  const padNum = (num: number) => num.toString().padStart(2, '0');

  const nowDateStr = `${nowDate.getFullYear()}.${padNum(
    nowDate.getMonth() + 1
  )}.${padNum(nowDate.getDate())}`;

  requiredPaths.forEach((p) => {
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p);
    }
  });

  const lastDataFile = fs
    .readdirSync(`${path}/01-data`)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a))
    .find(() => true);

  const stats = require(`${path}/01-data/${lastDataFile}`);
  if (!stats.data.data.financials) {
    write(`${path}/05-mos/${nowDateStr}.json`, {
      type: '05-mos',
      redFlags: ['Company not found'],
      symbol,
      date: nowDateStr,
      rating: 0
    });
    return;
  }

  const annual = stats.data.data.financials.annual;
  if (annual.revenue.length < 10) {
    write(`${path}/05-mos/${nowDateStr}.json`, {
      type: '05-mos',
      redFlags: ['Company has not been reporting results for 10 years'],
      symbol,
      date: nowDateStr,
      rating: 0
    });
    return;
  }

  const browser = await webkit.launch({
    headless: true
  });
  const page = await browser.newPage();

  const fcf10 = add_values(
    lastNFromArray(10, annual.cf_cfo),
    lastNFromArray(10, annual.cfi_ppe_purchases)
  );

  const ourGrowth = cagr(fcf10[7], fcf10[9], 3);

  const analystsGrowthNext5Years = stats[
    'Growth Next 5 Years (per annum)'
  ].replace('%', '');
  let growthNotes = 'We chose our growth calculation. calcuated from the FCF.';
  let growth = ourGrowth;
  if (ourGrowth > 20 && ourGrowth > Number(analystsGrowthNext5Years)) {
    growthNotes =
      'We chose the analysts growth calculation. ourGrowth is too high.';
    growth = analystsGrowthNext5Years;
  }

  if (growth > 25) {
    growthNotes += ` We capped the growth to 25, as ${growth} is too high for us.`;
    growth = 25;
  }

  if (overrideGrowth) {
    growthNotes += ` We overode growth to be ${overrideGrowth}`;
    growth = Number(overrideGrowth);
  }

  const periods: number[] = lastNFromArray<string>(10, annual.period_end_date)
    .map((x) => x.split('-')[0])
    .map((x) => Number(x));

  const growthAnalysis = {
    periods,
    fcf: fcf10,
    ourGrowth,
    analystsGrowthNext5Years,
    growth,
    growthNotes
  };

  const fcfAverage3Years = Math.round((fcf10[9] + fcf10[8] + fcf10[7]) / 3);

  const lt_debt10 = lastNFromArray<number>(10, annual.lt_debt);
  const currentLongTermDebt = lt_debt10[9];

  const shares_diluted10 = lastNFromArray<number>(10, annual.shares_diluted);
  const currentShares_diluted = shares_diluted10[9];

  const cash_and_equiv10 = lastNFromArray<number>(10, annual.cash_and_equiv);
  const currentcash_and_equiv = cash_and_equiv10[9];

  const dcfAnalysis = {
    calculator: 'https://tradebrains.in/dcf-calculator/',
    fcf: fcfAverage3Years.toString(),
    cash_and_equiv: Math.round(currentcash_and_equiv).toString(),
    longTermDebt: Math.round(currentLongTermDebt).toString(),
    sharesOutstanding: Math.round(currentShares_diluted).toString(),
    growthAnalysis,
    expectedGrowth: Math.round(growth).toString(),
    discountRate: '15',
    multiple: '10',
    mos: '50',
    currentPrice: stats['Price'].toString(),
    sellPrice: 0,
    buyPrice: 0
  };

  const warrenBuffettAnalysis = analyseWithWarrenBuffetsMethod(
    stats,
    growth / 100
  );

  const mos = {
    type: '05-mos',
    symbol,
    overrideGrowth,
    references: [],
    date: nowDateStr,

    notes:
      'The predicted growth rate is the least certian. You will need to adjust it based on your deep understanding of the business.',
    dcfAnalysis,
    warrenBuffettAnalysis
  };

  await page.goto(mos.dcfAnalysis.calculator);
  await enterString(page, '#fieldname4_1', mos.dcfAnalysis.fcf);
  await enterString(page, '#fieldname4_1', mos.dcfAnalysis.fcf);
  await enterString(page, '#fieldname2_1', mos.dcfAnalysis.cash_and_equiv);
  await enterString(page, '#fieldname3_1', mos.dcfAnalysis.longTermDebt);

  await enterString(page, '#fieldname5_1', mos.dcfAnalysis.sharesOutstanding);

  await enterString(page, '#fieldname6_1', mos.dcfAnalysis.expectedGrowth);
  await enterString(page, '#fieldname7_1', mos.dcfAnalysis.discountRate);
  await enterString(page, '#fieldname8_1', mos.dcfAnalysis.multiple);
  await enterString(page, '#fieldname77_1', mos.dcfAnalysis.mos);
  await enterString(page, '#fieldname80_1', mos.dcfAnalysis.currentPrice);

  const intrinsicValueAfterDiscount = await page.waitForSelector(
    '#fieldname74_1'
  );
  mos.dcfAnalysis.sellPrice =
    Number(await intrinsicValueAfterDiscount.inputValue()) *
    (100 / Number(mos.dcfAnalysis.mos));

  mos.dcfAnalysis.buyPrice = Number(
    await intrinsicValueAfterDiscount.inputValue()
  );

  write(`${path}/05-mos/${nowDateStr}.json`, mos);

  await browser.close();
}

function write(file: string, screen: any): void {
  console.log(`Writing ${file}`);
  try {
    fs.writeFileSync(file, JSON.stringify(screen, undefined, 4));
  } catch (err) {
    console.error(err);
  }
}

async function enterString(page: Page, id: string, value: string) {
  const field = await page.waitForSelector(id);
  if (field) {
    await field.scrollIntoViewIfNeeded();
    await field.fill(value);
  }
}

function add_values(values1: number[], values2: number[]): number[] {
  if (values1.length !== values2.length) {
    throw new Error('values have different lengths');
  }

  let result: number[] = [];
  for (let i = 0; i < values1.length; i++) {
    result = [...result, values1[i] + values2[i]];
  }
  return result;
}

function cagr(start: number, end: number, number: number) {
  // CAGR = Compound Annual Growth Rate
  // https://www.investopedia.com/terms/c/cagr.asp
  // http://fortmarinus.com/blog/1214/

  const step1 = end - start + Math.abs(start);
  const step2 = step1 / Math.abs(start);
  let step3 = Math.pow(step2, 1 / number);
  if (Object.is(NaN, step3)) {
    step3 = 0;
  }
  const step4 = (step3 - 1) * 100;

  return Math.round(step4);
}

app();

function lastNFromArray<T>(n: number, values: T[]): T[] {
  return values.slice(-n);
}

interface IReference {
  displayName: string;
  url: string;
}

interface IAnalysis {
  description: string;
  reference: IReference[];
  redFlags: string[];
  greenFlags: string[];

  score: number;
}

interface IWarrenBuffettAnalysis extends IAnalysis {
  notes: string;
  desiredGrowth: number;
  periods: number[];
  cf_cfo: number[];
  cf_cfo_notes: string;
  revenue: number[];
  revenueAvg3: number;
  revenueAvg3_notes: string;
  ppe_net: number[];
  ppe_net_notes: string;
  total_capEx: number[];
  total_capEx_notes: string;
  shares_outstanding: number[];

  revenueGrowthPerYear: number[];
  revenueGrowthPerYear_notes: string;

  ppeForADollar: number[];
  ppeForADollar_notes: string;

  growthCapEx: number[];
  growthCapEx_notes: string;

  maintenanceCapEx: number[];

  ownersEarnings: number[];

  ourMarketCapPrice: number;
  currentSharesOutstanding: number;
  buyPrice: number;
  sellPrice: number;
}

function analyseWithWarrenBuffetsMethod(
  stats: any,
  desiredGrowth: number
): IWarrenBuffettAnalysis {
  const annual = stats.data.data.financials.annual;
  const periods: number[] = lastNFromArray<string>(10, annual.period_end_date)
    .map((x) => x.split('-')[0])
    .map((x) => Number(x));

  const cf_cfo10 = lastNFromArray<number>(10, annual.cf_cfo);
  const revenue10 = lastNFromArray<number>(10, annual.revenue);
  const ppe_net10 = lastNFromArray<number>(10, annual.ppe_net);
  const total_capex10 = lastNFromArray<number>(10, annual.capex);
  const sharesOutstanding10 = lastNFromArray<number>(10, annual.shares_basic);

  const revenueGrowthPerYear10 = revenue10.map((val, idx, arr) => {
    if (idx === 0) {
      return 0;
    }
    return arr[idx] - arr[idx - 1];
  });

  const ppeForADollar10 = ppe_net10.map((ppe, idx) => ppe / revenue10[idx]);

  const growthCapEx10 = revenueGrowthPerYear10.map(
    (rev, idx) => rev * ppeForADollar10[idx]
  );

  const maintenanceCapEx10 = total_capex10.map(
    (cap, idx) => cap + growthCapEx10[idx]
  );

  const ownersEarnings10 = cf_cfo10.map(
    (cfo, idx) => cfo + maintenanceCapEx10[idx]
  );

  const revenueAvg3 = (revenue10[9] + revenue10[8] + revenue10[7]) / 3;

  const ourMarketCapPrice = revenueAvg3 * (1 / desiredGrowth);

  const currentSharesOutstanding = sharesOutstanding10[9];

  return {
    description: 'Warren Buffett valuation method.',
    notes: 'See spreadsheet Warrent Buffet Evaluation.xlsx',
    greenFlags: [],
    redFlags: [],
    reference: [
      {
        displayName: 'Section 5 - How Warren Buffett values Businesses.',
        url: 'https://profitful.online/courses/introduction-to-stock-analysis'
      }
    ],
    periods,
    desiredGrowth,
    cf_cfo: cf_cfo10,
    cf_cfo_notes: 'Cash Flow: Cash flow from operating activities',
    ppe_net: ppe_net10,
    ppe_net_notes:
      'Balance Sheet: Total Assets > Total non-current assets > net PPE',
    revenue: revenue10,
    revenueAvg3,
    revenueAvg3_notes: 'The average revenue over the last three years',
    shares_outstanding: sharesOutstanding10,
    revenueGrowthPerYear: revenueGrowthPerYear10,
    revenueGrowthPerYear_notes:
      'amount the revenue increases between the years',
    total_capEx: total_capex10,
    total_capEx_notes: 'Cash Flow statement.',
    ppeForADollar: ppeForADollar10,
    ppeForADollar_notes: 'ppe_net / revenue',
    growthCapEx: growthCapEx10,
    growthCapEx_notes: 'ownersEarningAvg3 * ppeForADollar',
    maintenanceCapEx: maintenanceCapEx10,
    ownersEarnings: ownersEarnings10,
    ourMarketCapPrice,
    currentSharesOutstanding,
    buyPrice: ourMarketCapPrice / currentSharesOutstanding,
    sellPrice: (ourMarketCapPrice / currentSharesOutstanding) * 2,
    score: 0
  };
}
