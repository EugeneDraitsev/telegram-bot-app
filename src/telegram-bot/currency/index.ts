import type { Bot } from 'grammy'

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
    const url = `https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_RATE_API_KEY}/latest/EUR`

    const response = await fetch(url, {
      signal: globalThis.AbortSignal.timeout(timeout),
    })

    if (!response?.ok) {
      throw new Error(`ExchangeRate API error: ${response?.statusText}`)
    }

    const { conversion_rates } = await response.json()

    return { rates: conversion_rates, provider: 'ExchangeRate' }
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

const setupCurrencyCommands = (bot: Bot) => {
  bot.command('c', async (ctx) => {
    const message = await getCurrencyMessage()
    return ctx.reply(message, { parse_mode: 'HTML' })
  })
}

export default setupCurrencyCommands
