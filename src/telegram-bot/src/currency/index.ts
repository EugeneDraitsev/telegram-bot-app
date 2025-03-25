import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { Bot, Context } from 'grammy'

import { getCryptoCurrency } from './crypto-currency'
import { getMainCurrencies } from './main-currency'
import { getRussianCurrency } from './russian-currency'

const getError = (err: Error, from: string): string => {
  console.error(`Can't fetch currency from ${from}`, err)
  return `Can't fetch currency from ${from}\n`
}

export interface CurrenciesResponse {
  readonly provider: string
  readonly rates: {
    readonly [currency: string]: number
  }
}

const timeout = 5_000
const getCurrenciesRates = async (): Promise<CurrenciesResponse> => {
  try {
    const url = 'http://api.exchangeratesapi.io/v1/latest'
    const params = new URLSearchParams({
      access_key: process.env.EXCHANGE_RATE_API_KEY || 'set_your_token',
      format: '1',
      base: 'EUR',
    })

    const response = await fetch(`${url}?${params}`, {
      signal: globalThis.AbortSignal.timeout(timeout),
    })

    if (!response?.ok) {
      throw new Error(`ExchangeRate API error: ${response?.statusText}`)
    }

    const { rates } = await response.json()

    return { rates, provider: 'ExchangeRate' }
  } catch (e) {
    console.error('ExchangeRate API error', e)
    const url = 'http://data.fixer.io/api/latest'
    const params = new URLSearchParams({
      access_key: process.env.FIXER_API_KEY || 'set_your_token',
      format: '1',
      base: 'EUR',
    })

    const response = await fetch(`${url}?${params}`, {
      signal: globalThis.AbortSignal.timeout(timeout),
    })

    const { rates } = await response.json()

    return { rates, provider: 'Fixer' }
  }
}

export const getCurrencyMessage = async () => {
  const currenciesRatesPromise = getCurrenciesRates()
  const promises = [
    getMainCurrencies(currenciesRatesPromise).catch((err) =>
      getError(err, 'ExchangeRate and Fixer'),
    ),
    getRussianCurrency(currenciesRatesPromise).catch((err) =>
      getError(err, 'ExchangeRate and Fixer'),
    ),
    getCryptoCurrency().catch((err) => getError(err, 'poloniex')),
  ]

  const result = await Promise.all(promises).then(
    (result) => `${result.join('\n')}`,
  )

  return result
}

const setupCurrencyCommands = (bot: Bot<ParseModeFlavor<Context>>) => {
  bot.command('c', async (ctx) => {
    const message = await getCurrencyMessage()
    return ctx.replyWithHTML(message)
  })
}

export default setupCurrencyCommands
