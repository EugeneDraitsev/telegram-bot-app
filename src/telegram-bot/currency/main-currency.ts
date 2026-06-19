import { logger } from '@tg-bot/common'
import { buildCurrencyFallbackText } from './format'
import type { CurrenciesResponse, CurrencyRateSection } from './types'

const timeout = 10_000

type Rate = {
  buyCurrencyName: string
  sellCurrencyName: string
  sellAmount: number
}

type Data = {
  rates: Array<Rate>
}

const formatRate = (value: number) => value.toFixed(2)

// More precise BYN rates
const getBynRates = async () => {
  try {
    const BYN_RATES_URL =
      'https://mobile.bsb.by/api/v1/free-zone-management/exchange-rates/rates'
    const data: Data = await fetch(BYN_RATES_URL, {
      signal: globalThis.AbortSignal.timeout(timeout),
      method: 'POST',
      body: JSON.stringify({
        bankDepartmentId: 7,
        period: Date.now(),
        type: 'CASH',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    }).then((x) => x.json())

    const usdRate = data.rates?.find(
      (x) => x.buyCurrencyName === 'USD' && x.sellCurrencyName === 'BYN',
    )?.sellAmount

    const eurRate = data.rates?.find(
      (x) => x.buyCurrencyName === 'EUR' && x.sellCurrencyName === 'BYN',
    )?.sellAmount

    return {
      USD: usdRate,
      EUR: eurRate,
    }
  } catch (e) {
    logger.error({ error: e }, 'Can not fetch BYN rates')
    return {}
  }
}

export const getMainCurrencySection = async (
  ratesPromise: Promise<CurrenciesResponse>,
): Promise<CurrencyRateSection> => {
  const [bynRates, { rates, provider }] = await Promise.all([
    getBynRates(),
    ratesPromise,
  ])

  return {
    title: 'Основные пары',
    provider,
    columns: ['', 'USD', 'EUR'],
    rows: [
      {
        label: '🇧🇾BYN',
        values: [
          formatRate(Number(bynRates.USD) || rates.BYN / rates.USD),
          formatRate(Number(bynRates.EUR) || rates.BYN),
        ],
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
