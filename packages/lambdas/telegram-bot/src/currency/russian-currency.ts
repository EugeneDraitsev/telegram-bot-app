import axios from 'axios'
import { includes, noop } from 'lodash'

const timeout = 15000

const formatRow = (key: string, value: number, length = 10) => {
  return `${key.toUpperCase()}: ${value.toFixed(2).padStart(length - key.length, ' ')}`
}

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

  // fallback brent value if meduza returns undefined
  currency.brent = { current: brentPrice }

  const maxLength = Math.max(
    ...Object.entries(currency).map(
      ([key, value]: any) => String(value.current).length + key.length,
    ),
  )

  const currencyString = Object.keys(currency)
    .filter((curr) => includes(currencyCodes, curr))
    .map((key) => formatRow(key, Number(currency[key].current), maxLength))
    .join('\n')

  const brentString = brentPrice ? `\nBRENT: ${brentPrice}` : ''

  return `Курсы медузы:<pre>${currencyString}${brentString}</pre>\n`
}
