import { type Bot, type Context, InputFile } from 'grammy/web'
import type { Api } from 'grammy'

import {
  isAiAllowedChat,
  logger,
  sendRichMessageWithFallback,
  trySendWidget,
} from '@tg-bot/common'
import {
  buildCurrencyBackgroundDebugCaption,
  getCurrencyBackgroundImage,
} from './background-image'
import { fetchBrentPrice } from './brent'
import { getCryptoCurrencySection, getCryptoQuotes } from './crypto-currency'
import { buildCurrencyMessages } from './format'
import { getCurrencyHistory } from './history'
import { getCurrencyImage } from './image'
import { getMainCurrencySection } from './main-currency'
import { getRussianCurrencySection } from './russian-currency'
import type {
  CurrenciesResponse,
  CurrencyMessages,
  CurrencyRateSection,
} from './types'
import { buildCurrencyWidgetHtml } from './widget'

export type { CurrenciesResponse, CurrencyMessages, CurrencyRateSection }

export type GetCurrencyMessagesOptions = {
  readonly includeBackgroundImage?: boolean
}

export const SCHEDULED_CURRENCY_MESSAGE_OPTIONS = {
  includeBackgroundImage: true,
} as const satisfies GetCurrencyMessagesOptions

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
    const url = 'https://data.fixer.io/api/latest'
    const params = new URLSearchParams({
      access_key: process.env.FIXER_API_KEY || 'set_your_token',
      format: '1',
      base: 'EUR',
    })

    const response = await fetch(`${url}?${params}`, {
      signal: globalThis.AbortSignal.timeout(timeout),
    })

    if (!response.ok) {
      throw new Error(`Fixer API error: ${response.statusText}`)
    }

    const { rates } = await response.json()

    return { rates, provider: 'Fixer' }
  }
}

export const getCurrencyMessages = async ({
  includeBackgroundImage = false,
}: GetCurrencyMessagesOptions = {}): Promise<CurrencyMessages> => {
  const currenciesRatesPromise = getCurrenciesRates()
  const backgroundPromise = includeBackgroundImage
    ? getCurrencyBackgroundImage()
    : Promise.resolve(undefined)
  const promises = [
    getMainCurrencySection(currenciesRatesPromise).catch((err) =>
      getError(err, 'ExchangeRate and Fixer'),
    ),
    getRussianCurrencySection(currenciesRatesPromise).catch((err) =>
      getError(err, 'ExchangeRate and Fixer'),
    ),
    getCryptoCurrencySection().catch((err) => getError(err, 'crypto')),
  ]

  const [sections, background] = await Promise.all([
    Promise.all(promises),
    backgroundPromise,
  ])

  return {
    ...buildCurrencyMessages(sections),
    background,
  }
}

/**
 * The rates as a widget with a week of history. Resolves to undefined when it
 * cannot be built, so the caller falls back to the image.
 */
export const getCurrencyWidgetHtml = async (): Promise<string | undefined> => {
  try {
    const [{ rates }, crypto, brent, history] = await Promise.all([
      getCurrenciesRates(),
      // The widget still has the fiat tabs to show without the coins.
      getCryptoQuotes().catch(() => undefined),
      fetchBrentPrice(),
      getCurrencyHistory(),
    ])
    const prices: Record<string, number | undefined> = { BRENT: brent }
    for (const quote of crypto?.quotes ?? []) {
      prices[quote.symbol] = quote.price
    }

    return buildCurrencyWidgetHtml({ rates, prices }, history)
  } catch (error) {
    logger.warn({ error }, 'currency.widget_failed')
    return undefined
  }
}

type SendRichMessageParams = Parameters<typeof sendRichMessageWithFallback>[0]
type SendPhotoOptions = Parameters<Api['sendPhoto']>[2]
type CurrencySendOptions = SendRichMessageParams['richOptions'] &
  SendPhotoOptions
type CurrencyApi = SendRichMessageParams['api'] &
  Partial<Pick<Api, 'sendPhoto'>>

function getFallbackOptions(
  options: CurrencySendOptions | undefined,
): SendRichMessageParams['richOptions'] {
  if (!options) {
    return undefined
  }

  const fallbackOptions = { ...options }
  delete fallbackOptions.caption

  return fallbackOptions
}

export async function sendCurrencyMessages({
  api,
  chatId,
  messages,
  options,
  forceFallback = false,
}: {
  api: CurrencyApi
  chatId: number | string
  messages: CurrencyMessages
  options?: CurrencySendOptions
  forceFallback?: boolean
}) {
  if (!forceFallback && typeof api.sendPhoto === 'function') {
    const image = await getCurrencyImage(
      messages.sections,
      messages.background?.image,
    )

    if (image) {
      try {
        return await api.sendPhoto(chatId, new InputFile(image, 'rates.png'), {
          ...options,
        })
      } catch (error) {
        logger.warn({ chatId, error }, 'currency.image_send_failed')
      }
    }
  }

  return sendRichMessageWithFallback({
    api,
    chatId,
    richMessage: messages.richMessage,
    fallbackText: messages.text,
    richOptions: getFallbackOptions(options),
    fallbackOptions: {
      ...getFallbackOptions(options),
      parse_mode: 'HTML',
    },
  })
}

export async function sendCurrencyCommand(
  ctx: Context,
  {
    forceFallback = false,
    includeBackgroundImage = false,
    debugBackground = false,
    widget = false,
  }: {
    readonly forceFallback?: boolean
    readonly includeBackgroundImage?: boolean
    readonly debugBackground?: boolean
    /** Reply with the widget where Telegram can show one. */
    readonly widget?: boolean
  } = {},
) {
  const chatId = ctx.chat?.id
  if (!chatId) return
  const withBackground = includeBackgroundImage || debugBackground
  // The background costs web searches and image generation, like /x.
  if (withBackground && !(await isAiAllowedChat(chatId))) return

  const messageThreadId = ctx.message?.message_thread_id
  // Widgets reach private chats only, so other chats skip the history fetch.
  if (widget && ctx.chat.type === 'private') {
    const html = await getCurrencyWidgetHtml()
    const sent =
      html &&
      (await trySendWidget({
        api: ctx.api,
        chat: ctx.chat,
        html,
        messageThreadId,
      }))
    if (sent) return sent
  }

  const options =
    typeof messageThreadId === 'number'
      ? { message_thread_id: messageThreadId }
      : undefined
  const messages = await getCurrencyMessages({
    includeBackgroundImage: withBackground,
  })
  const caption = debugBackground
    ? buildCurrencyBackgroundDebugCaption(messages.background)
    : undefined

  return sendCurrencyMessages({
    api: ctx.api,
    chatId,
    messages,
    options: caption ? { ...options, caption } : options,
    forceFallback,
  })
}

const setupCurrencyCommands = (bot: Bot) => {
  bot.command('c', (ctx) => sendCurrencyCommand(ctx, { widget: true }))
  bot.command('cf', (ctx) => sendCurrencyCommand(ctx, { forceFallback: true }))
  bot.command('cs', (ctx) =>
    sendCurrencyCommand(ctx, SCHEDULED_CURRENCY_MESSAGE_OPTIONS),
  )
  bot.command('ci', (ctx) =>
    sendCurrencyCommand(ctx, {
      includeBackgroundImage: true,
      debugBackground: true,
    }),
  )
}

export default setupCurrencyCommands
