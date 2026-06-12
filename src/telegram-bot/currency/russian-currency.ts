import { fetchBrentPrice } from './brent'
import { buildCurrencyFallbackText } from './format'
import type { CurrenciesResponse, CurrencyRateSection } from './types'

const formatRate = (value: number) =>
  Number.isFinite(value) ? value.toFixed(2) : 'n/a'

const formatBrent = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value)
    ? `$${value.toFixed(2)}`
    : 'n/a'

export const getRussianCurrencySection = async (
  currenciesRatesPromise: Promise<CurrenciesResponse>,
): Promise<CurrencyRateSection> => {
  const brentPromise = fetchBrentPrice()

  const [{ rates, provider }, brentPrice] = await Promise.all([
    currenciesRatesPromise,
    brentPromise,
  ])

  return {
    title: 'Рубль и нефть',
    provider,
    columns: ['Актив', 'Значение'],
    rows: [
      { label: 'USD/RUB', value: formatRate(rates.RUB / rates.USD) },
      { label: 'EUR/RUB', value: formatRate(rates.RUB) },
      { label: '🛢Brent', value: formatBrent(brentPrice) },
    ],
  }
}

export const getRussianCurrency = async (
  currenciesRatesPromise: Promise<CurrenciesResponse>,
) =>
  buildCurrencyFallbackText([
    await getRussianCurrencySection(currenciesRatesPromise),
  ])
