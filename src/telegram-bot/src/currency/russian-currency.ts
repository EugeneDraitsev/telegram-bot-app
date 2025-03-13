import type { CurrenciesResponse } from './index'

const timeout = 10_000

const formatRow = (key: string, value: string, length = 10) => {
  return `${key.toUpperCase()}: ${value.padStart(length - key.length, ' ')}`
}

export const getRussianCurrency = async (
  currenciesRatesPromise: Promise<CurrenciesResponse>,
) => {
  const brentUrl = 'https://oilprice.com/freewidgets/json_get_oilprices'

  const brentPromise = fetch(brentUrl, {
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
    },
    body: 'blend_id=46&period=2',
    method: 'POST',
    mode: 'cors',
    signal: globalThis.AbortSignal.timeout(timeout),
  })
    .then((x) => x.json())
    .then((x) => x?.last_price)
    .catch((e) => console.error('Failed to fetch brent price: ', e))

  const [{ rates, provider }, brentPrice] = await Promise.all([
    currenciesRatesPromise,
    brentPromise,
  ])

  const currency: Record<string, string> = {
    USD: Number(rates.RUB / rates.USD).toFixed(2),
    EUR: Number(rates.RUB).toFixed(2),
    brent: Number(brentPrice).toFixed(2),
  }

  const maxLength = Math.max(
    ...Object.entries(currency).map(
      ([key, value]) => value.length + key.length,
    ),
  )

  const currencyString = Object.keys(currency)
    .map((key) => formatRow(key, currency[key], maxLength))
    .join('\n')

  return `Курсы эльвиры (${provider}):\n<pre>${currencyString}</pre>\n`
}
