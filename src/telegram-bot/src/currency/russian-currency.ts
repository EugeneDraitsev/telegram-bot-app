import { includes, noop } from 'lodash'

type Currency = {
  current: number
}

const timeout = 10_000

const formatRow = (key: string, value: number, length = 10) => {
  return `${key.toUpperCase()}: ${value
    .toFixed(2)
    .padStart(length - key.length, ' ')}`
}

export const getRussianCurrency = async (): Promise<string> => {
  const currencyCodes = ['usd', 'eur']
  const medusaUrl = 'https://meduza.io/api/misc/stock/all'
  const nasdaqUrl =
    'https://api.nasdaq.com/api/quote/BZ%3ANMX/info?assetclass=commodities'

  const currency: Record<string, Currency> = await fetch(medusaUrl, {
    signal: AbortSignal.timeout(timeout),
  })
    .then((x) => x.json())
    .catch(noop)

  const brentPrice =
    currency?.brent?.current ||
    (await fetch(nasdaqUrl, { signal: AbortSignal.timeout(timeout) })
      .then((x) => x.json())
      .then((x) => x.data?.primaryData?.lastSalePrice?.replace('$', ''))
      .catch((e) => console.error('Failed to fetch brent price: ', e)))

  // fallback brent value if meduza returns undefined
  currency.brent = { current: brentPrice }

  const maxLength = Math.max(
    ...Object.entries(currency).map(
      ([key, value]) => String(value.current).length + key.length,
    ),
  )

  const currencyString = Object.keys(currency)
    .filter((curr) => includes(currencyCodes, curr))
    .map((key) => formatRow(key, Number(currency[key].current), maxLength))
    .join('\n')

  const brentString = brentPrice ? `\nBRENT: ${brentPrice}` : ''

  return `Курсы медузы:\n<pre>${currencyString}${brentString}</pre>\n`
}
