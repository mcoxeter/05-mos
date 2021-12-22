# 04-mos

This program will attempt to find a buy and sell price for a stock by calculating the intrinsic value of the stock using the discounted cash flow method.

It uses the following site for the caluculation: https://tradebrains.in/dcf-calculator/

The following values are used in the calculation

**Free Cash Flow**

> The average fcf value for the last three years

**Current Long Term Debt**

> The current long term debt can be found on the balance sheet

**Diluted shares outstanding**

> The number of shares in a company if all convertable securities where realized.

**Predicted growth**

> The average growth rate of FCF over the last three years or the analysts prediction.

## Setup

you need to create a config.json file. This will configure the program.
There is one parameter you need to add.

1. path - This is a folder path to where your output files will be stored on your harddisk.

This is an example of a config.json file:

```json
{
  "path": "C:/Business analysis/Evaluation"
}
```

## Usage

> Before you run this program, you will need to have run the `01-data` program first on the stock.

In this example the program will score the fundamental data on Facebook

`npm start -- FB`

## Output

The output of this program is scoring data in json form. It will be outputted into a sub folder of your path in the config file.

### Output folder structure

_path_/_stock-name_/05-mos/_date_.json

e.g.
C:/Business analysis/Evaluation/FB/05-mos/2021.12.18.json

### Example output

```
{
  "type": "05-mos",
  "symbol": "FB",
  "references": [],
  "date": "2021.12.22",
  "calculator": "https://tradebrains.in/dcf-calculator/",
  "notes": "These values are conservative. You may need to adjust the expectedGrowth based on your deep understanding of the business.",
  "fcf": "20067666667",
  "cash_and_equiv": "17576000000",
  "longTermDebt": "0",
  "sharesOutstanding": "2888000000",
  "growthAnalysis": {
    "FCF": [23632000000, 21212000000, 15359000000],
    "ourGrowth": 35,
    "analystsGrowthNext5Years": "21.35",
    "growth": "21.35",
    "growthNotes": "We chose the analysts growth calculation. ourGrowth is too high."
  },
  "expectedGrowth": "21",
  "discountRate": "15",
  "multiple": "10",
  "mos": "50",
  "currentPrice": "333.79",
  "sellPrice": 214.42,
  "buyPrice": 107.21
}
```
