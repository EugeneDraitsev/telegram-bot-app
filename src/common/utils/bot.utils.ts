/**
 * Bot utilities for creating Grammy bot instances
 * Shared between telegram-bot and agent-worker
 */

import { Bot, type Context, type NextFunction } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { saveMessage } from '../upstash'
import { cleanGeminiMessage, isAiEnabledChat } from './ai.utils'

/**
 * Wrapper that sets `duplex: 'half'` whenever a request has a body
 * Required for Grammy to work properly in serverless environments
 */
// biome-ignore lint/suspicious/noExplicitAny: fetch typing workaround
const fetchWithDuplex = (input: any, init: any = {}) => {
  if (init?.body && typeof init.duplex === 'undefined') {
    init.duplex = 'half'
  }
  return fetch(input, init)
}

/**
 * Create a new Grammy bot instance with proper fetch configuration
 */
export const createBot = () =>
  new Bot(process.env.TOKEN || '', {
    client: {
      // biome-ignore lint/suspicious/noExplicitAny: Grammy fetch typing is incorrect
      fetch: fetchWithDuplex as any,
    },
  })

function parseChatId(message: Message): number | null {
  const rawId = message.chat?.id
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    return rawId
  }

  if (typeof rawId === 'bigint') {
    const parsed = Number(rawId)
    return Number.isSafeInteger(parsed) ? parsed : null
  }

  if (typeof rawId === 'string') {
    const parsed = Number(rawId)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function asTelegramMessage(value: unknown): Message | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { message_id?: unknown; chat?: { id?: unknown } }
  if (typeof candidate.message_id !== 'number') {
    return null
  }

  if (!candidate.chat || typeof candidate.chat !== 'object') {
    return null
  }

  const chatId = candidate.chat.id
  if (
    typeof chatId !== 'number' &&
    typeof chatId !== 'string' &&
    typeof chatId !== 'bigint'
  ) {
    return null
  }

  return value as Message
}

/**
 * Save sent bot message to Redis chat history (AI-enabled chats only).
 */
export async function saveBotReplyToHistory(messageLike: unknown) {
  const message = asTelegramMessage(messageLike)
  if (!message) {
    return
  }

  const chatId = parseChatId(message)
  if (!chatId || !isAiEnabledChat(chatId)) {
    return
  }

  if (typeof message.text === 'string') {
    message.text = cleanGeminiMessage(message.text)
  }
  if (typeof message.caption === 'string') {
    message.caption = cleanGeminiMessage(message.caption)
  }

  await saveMessage(message, chatId).catch((error) =>
    console.error('saveHistory error: ', error),
  )
}

/**
 * Middleware that saves bot text replies to chat history.
 * Agent worker saves responses through saveBotReplyToHistory directly.
 */
export async function saveBotMessageMiddleware(
  ctx: Context,
  next: NextFunction,
) {
  const originalReply = ctx.reply.bind(ctx)

  ctx.reply = async (text, ...args) => {
    const sentMessage = await originalReply(text, ...args)
    await saveBotReplyToHistory(sentMessage)
    return sentMessage
  }

  await next()
}
