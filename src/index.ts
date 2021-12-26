#!/usr/bin/env node
import { Page, webkit } from 'playwright';
import fs from 'fs';
const config = require('./config.json');

async function app() {
  var myArgs = process.argv.slice(2);
  const symbol = myArgs[0];

  const overrideGrowth = myArgs[1];

  const path = `${config.path}/${symbol}`;

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

  const browser = await webkit.launch({
    headless: true
  });
  const page = await browser.newPage();

  const ourGrowth = Number(stats['Growth'].replace('%', ''));
  const annual = stats.data.data.financials.annual;

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

  const growthAnalysis = {
    FCF: stats['FFC'],
    ourGrowth: ourGrowth,
    analystsGrowthNext5Years,
    growth,
    growthNotes
  };

  const lt_debt10 = lastNFromArray<number>(10, annual.lt_debt);
  const currentLongTermDebt = lt_debt10[9];

  const shares_diluted10 = lastNFromArray<number>(10, annual.shares_diluted);
  const currentShares_diluted = shares_diluted10[9];

  const cash_and_equiv10 = lastNFromArray<number>(10, annual.cash_and_equiv);
  const currentcash_and_equiv = cash_and_equiv10[9];

  const dcfAnalysis = {
    calculator: 'https://tradebrains.in/dcf-calculator/',
    fcf: Math.round(stats['FreeCashFlowAverage']).toString(),
    overrideGrowth,
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

  console.log('Writing ', `${path}/05-mos/${nowDateStr}.json`);
  try {
    fs.writeFileSync(
      `${path}/05-mos/${nowDateStr}.json`,
      JSON.stringify(mos, undefined, 4)
    );
  } catch (err) {
    console.error(err);
  }

  await browser.close();
}

async function enterString(page: Page, id: string, value: string) {
  const field = await page.waitForSelector(id);
  if (field) {
    await field.scrollIntoViewIfNeeded();
    await field.fill(value);
  }
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
  revenue: number[];
  ppe_net: number[];
  total_capEx: number[];
  shares_outstanding: number[];

  revenueGrowthPerYear: number[];

  ppeForADollar: number[];

  growthCapEx: number[];

  maintenanceCapEx: number[];

  owersEarnings: number[];

  ownersEarningAvg3: number;
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

  const ownersEarningAvg3 =
    (ownersEarnings10[9] + ownersEarnings10[8] + ownersEarnings10[7]) / 3;

  const ourMarketCapPrice = ownersEarningAvg3 * (1 / desiredGrowth);

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
    ppe_net: ppe_net10,
    revenue: revenue10,
    shares_outstanding: sharesOutstanding10,
    revenueGrowthPerYear: revenueGrowthPerYear10,
    total_capEx: total_capex10,
    ppeForADollar: ppeForADollar10,
    growthCapEx: growthCapEx10,
    maintenanceCapEx: maintenanceCapEx10,
    owersEarnings: ownersEarnings10,
    ownersEarningAvg3,
    ourMarketCapPrice,
    currentSharesOutstanding,
    buyPrice: ourMarketCapPrice / currentSharesOutstanding,
    sellPrice: (ourMarketCapPrice / currentSharesOutstanding) * 2,
    score: 0
  };
}
