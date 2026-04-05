import { logger } from '@tg-bot/common'
import type { CurrenciesResponse } from './index'

const timeout = 10_000

type Rate = {
  buyCurrencyName: string
  sellCurrencyName: string
  sellAmount: number
}

type Data = {
  rates: Array<Rate>
}

const formatRow = (value: number, length = 10) =>
  value.toFixed(2).padStart(length, ' ')

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

export const getMainCurrencies = async (
  ratesPromise: Promise<CurrenciesResponse>,
) => {
  const [bynRates, { rates, provider }] = await Promise.all([
    getBynRates(),
    ratesPromise,
  ])

  const ratesToDisplay = {
    '🇧🇾USD/BYN': Number(bynRates?.USD) || rates.BYN / rates.USD,
    '🇧🇾EUR/BYN': Number(bynRates?.EUR) || rates.BYN,
    '🇸🇪USD/SEK': rates.SEK / rates.USD,
    '🇸🇪EUR/SEK': rates.SEK,
    '🇵🇱USD/PLN': rates.PLN / rates.USD,
    '🇵🇱EUR/PLN': rates.PLN,
  }

  const maxLength = Math.max(
    ...Object.values(ratesToDisplay).map((x) => x.toFixed(2).length),
  )

  const ratesString = Object.entries(ratesToDisplay)
    .map(([key, value]) => `${key}: ${formatRow(value, maxLength)}`)
    .join('\n')

  return `Курсы ${provider}:\n<pre>${ratesString}</pre>\n`
}
