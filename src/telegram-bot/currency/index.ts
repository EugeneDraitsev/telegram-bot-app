import type { Bot } from 'grammy/web'

import { logger, sendRichMessageWithFallback } from '@tg-bot/common'
import { getCryptoCurrencySection } from './crypto-currency'
import { buildCurrencyMessages } from './format'
import { getMainCurrencySection } from './main-currency'
import { getRussianCurrencySection } from './russian-currency'
import type {
  CurrenciesResponse,
  CurrencyMessages,
  CurrencyRateSection,
} from './types'

export type { CurrenciesResponse, CurrencyMessages, CurrencyRateSection }

const getError = (err: Error, from: string): CurrencyRateSection => {
  logger.error({ error: err }, `Can't fetch currency from ${from}`)
  return {
    title: from,
    provider: from,
    rows: [],
    error: `Can't fetch currency from ${from}`,
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
    logger.error({ error: e }, 'ExchangeRate API error')
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

export const getCurrencyMessages = async (): Promise<CurrencyMessages> => {
  const currenciesRatesPromise = getCurrenciesRates()
  const promises = [
    getMainCurrencySection(currenciesRatesPromise).catch((err) =>
      getError(err, 'ExchangeRate and Fixer'),
    ),
    getRussianCurrencySection(currenciesRatesPromise).catch((err) =>
      getError(err, 'ExchangeRate and Fixer'),
    ),
    getCryptoCurrencySection().catch((err) => getError(err, 'crypto')),
  ]

  return buildCurrencyMessages(await Promise.all(promises))
}

type SendRichMessageParams = Parameters<typeof sendRichMessageWithFallback>[0]

export function sendCurrencyMessages({
  api,
  chatId,
  messages,
  options,
}: {
  api: SendRichMessageParams['api']
  chatId: number | string
  messages: CurrencyMessages
  options?: SendRichMessageParams['richOptions']
}) {
  return sendRichMessageWithFallback({
    api,
    chatId,
    richMessage: messages.richMessage,
    fallbackText: messages.text,
    richOptions: options,
    fallbackOptions: {
      ...options,
      parse_mode: 'HTML',
    },
  })
}

const setupCurrencyCommands = (bot: Bot) => {
  bot.command('c', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) return

    const messageThreadId = ctx.message?.message_thread_id
    const options =
      typeof messageThreadId === 'number'
        ? { message_thread_id: messageThreadId }
        : undefined
    const messages = await getCurrencyMessages()

    return sendCurrencyMessages({
      api: ctx.api,
      chatId,
      messages,
      options,
    })
  })
}

export default setupCurrencyCommands
