#!/usr/bin/env node
import { Page, webkit } from 'playwright';
import fs from 'fs';

async function app() {
  var myArgs = process.argv.slice(2);
  const symbol = myArgs[0];

  const path = `C:/Users/Mike/OneDrive - Digital Sparcs/Investing/Value Investing Process/Business analysis/Evaluation/${symbol}/`;

  const lastDataFile = fs
    .readdirSync(`${path}/core`)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => b.localeCompare(a))
    .find(() => true);

  const stats = require(`${path}/core/${lastDataFile}`);

  const browser = await webkit.launch({
    headless: false
  });
  const page = await browser.newPage();

  const sharesOutstanding =
    stats['Implied Shares Outstanding 6'] !== 'N/A'
      ? stats['Implied Shares Outstanding 6']
      : stats['Shares Outstanding 5'];

  let growth = 15;

  const ourGrowth = Number(stats['Growth'].replace('%', ''));
  const analystGrowth = Number(
    stats['Growth Next 5 Years (per annum)'].replace('%', '')
  );

  if (ourGrowth > 20) {
    growth = analystGrowth;
  } else {
    growth = ourGrowth;
  }

  const input = {
    calculator: 'https://tradebrains.in/dcf-calculator/',
    symbol,
    fcf: Math.round(stats['FreeCashFlowAverage']).toString(),
    cash: Math.round(stats['Total Cash (mrq)']).toString(),
    debt: Math.round(stats['Total Debt (mrq)']).toString(),
    sharesOutstanding: Math.round(sharesOutstanding).toString(),
    expectedGrowth: Math.round(growth).toString(),
    discountRate: '15',
    multiple: '10',
    mos: '50',
    price: stats['Price'].toString(),
    intrinsicValue: ''
  };

  await page.goto(input.calculator);
  await enterString(page, '#fieldname4_1', input.fcf);
  await enterString(page, '#fieldname2_1', input.cash);
  await enterString(page, '#fieldname3_1', input.debt);

  await enterString(page, '#fieldname5_1', input.sharesOutstanding);

  await enterString(page, '#fieldname6_1', input.expectedGrowth);
  await enterString(page, '#fieldname7_1', input.discountRate);
  await enterString(page, '#fieldname8_1', input.multiple);
  await enterString(page, '#fieldname77_1', input.mos);
  await enterString(page, '#fieldname80_1', input.price);

  const intrinsicValue = await page.waitForSelector('#fieldname74_1');

  input.intrinsicValue = (await intrinsicValue.inputValue()).toString();

  const nowDate = new Date();
  const padNum = (num: number) => num.toString().padStart(2, '0');

  const nowDateStr = `${nowDate.getFullYear()}.${padNum(
    nowDate.getMonth() + 1
  )}.${padNum(nowDate.getDate())}`;

  try {
    fs.writeFileSync(
      `${path}/fair-value-${nowDateStr}.json`,
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
