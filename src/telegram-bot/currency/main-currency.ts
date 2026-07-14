import { buildCurrencyFallbackText } from './format'
import type { CurrenciesResponse, CurrencyRateSection } from './types'

const formatRate = (value: number) => value.toFixed(2)

export const getMainCurrencySection = async (
  ratesPromise: Promise<CurrenciesResponse>,
): Promise<CurrencyRateSection> => {
  const { rates, provider } = await ratesPromise

  return {
    title: 'Основные пары',
    provider,
    columns: ['', 'USD', 'EUR'],
    rows: [
      {
        label: '🇧🇾BYN',
        values: [formatRate(rates.BYN / rates.USD), formatRate(rates.BYN)],
      },
      {
        label: '🇸🇪SEK',
        values: [formatRate(rates.SEK / rates.USD), formatRate(rates.SEK)],
      },
      {
        label: '🇵🇱PLN',
        values: [formatRate(rates.PLN / rates.USD), formatRate(rates.PLN)],
      },
      {
        label: '🇺🇦UAH',
        values: [formatRate(rates.UAH / rates.USD), formatRate(rates.UAH)],
      },
    ],
  }
}

export const getMainCurrencies = async (
  ratesPromise: Promise<CurrenciesResponse>,
) => buildCurrencyFallbackText([await getMainCurrencySection(ratesPromise)])
