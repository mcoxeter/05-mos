#!/usr/bin/env node
import { Page, webkit } from 'playwright';
import fs from 'fs';
const config = require('./config.json');

async function app() {
  var myArgs = process.argv.slice(2);
  const symbol = myArgs[0];

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

  const input = {
    type: '05-mos',
    symbol,
    references: [],
    date: nowDateStr,
    calculator: 'https://tradebrains.in/dcf-calculator/',
    notes:
      'The predicted growth rate is the least certian. You will need to adjust it based on your deep understanding of the business.',
    fcf: Math.round(stats['FreeCashFlowAverage']).toString(),
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

  await page.goto(input.calculator);
  await enterString(page, '#fieldname4_1', input.fcf);
  await enterString(page, '#fieldname2_1', input.cash_and_equiv);
  await enterString(page, '#fieldname3_1', input.longTermDebt);

  await enterString(page, '#fieldname5_1', input.sharesOutstanding);

  await enterString(page, '#fieldname6_1', input.expectedGrowth);
  await enterString(page, '#fieldname7_1', input.discountRate);
  await enterString(page, '#fieldname8_1', input.multiple);
  await enterString(page, '#fieldname77_1', input.mos);
  await enterString(page, '#fieldname80_1', input.currentPrice);

  const intrinsicValueAfterDiscount = await page.waitForSelector(
    '#fieldname74_1'
  );
  input.sellPrice =
    Number(await intrinsicValueAfterDiscount.inputValue()) *
    (100 / Number(input.mos));

  input.buyPrice = Number(await intrinsicValueAfterDiscount.inputValue());

  console.log('Writing ', `${path}/05-mos/${nowDateStr}.json`);
  try {
    fs.writeFileSync(
      `${path}/05-mos/${nowDateStr}.json`,
      JSON.stringify(input, undefined, 4)
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
