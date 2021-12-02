import axios from 'axios'
import { includes, noop } from 'lodash'

const timeout = 15000

export const getRussianCurrency = async (): Promise<string> => {
  const currencyCodes = ['usd', 'eur']
  const medusaUrl = 'https://meduza.io/api/misc/stock/all'
  const nasdaqUrl = 'https://api.nasdaq.com/api/quote/BZ%3ANMX/info?assetclass=commoditie'

  const currency = await axios(medusaUrl, { timeout })
    .then((x) => x.data)
    .catch(noop)

  const brentPrice =
    currency?.brent?.current ||
    (await axios(nasdaqUrl, { timeout: 5000 })
      .then((x) => x.data?.summaryData?.LastSalePrice?.value)
      .catch(noop))

  const currencyString = Object.keys(currency)
    .filter((curr) => includes(currencyCodes, curr))
    .reduce(
      (value, key) =>
        value.concat(`${key.toUpperCase()}: ${Number(currency[key].current).toFixed(2)}\n`),
      '',
    )

  const brentString = brentPrice ? `BRENT: ${brentPrice}\n` : ''

  return `Курсы медузы:\n${currencyString}${brentString}`
}
