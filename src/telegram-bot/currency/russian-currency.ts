import { fetchBrentPrice } from './brent'
import type { CurrenciesResponse } from './index'

const formatRow = (key: string, value: string, length = 10) => {
  return `${key.toUpperCase()}: ${value.padStart(length - key.length, ' ')}`
}

export const getRussianCurrency = async (
  currenciesRatesPromise: Promise<CurrenciesResponse>,
) => {
  const brentPromise = fetchBrentPrice()

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
