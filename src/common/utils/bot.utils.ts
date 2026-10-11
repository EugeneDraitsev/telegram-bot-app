/**
 * Bot utilities for creating Grammy bot instances
 * Shared between telegram-bot and agent-worker
 */

import { Bot } from 'grammy/web'
import type { Message } from 'grammy/types'

import { logger } from '../logger'
import { enqueueActivityWorker } from './sqs.utils'

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
 * Queue outgoing messages once for commands, the agent and scheduled sends.
 * The activity worker owns persistence; ingress queues incoming messages itself.
 */
export const createBot = ({ saveHistory = true } = {}) => {
  const bot = new Bot(process.env.TOKEN || '', {
    client: {
      // biome-ignore lint/suspicious/noExplicitAny: Grammy fetch typing is incorrect
      fetch: fetchWithDuplex as any,
    },
  })

  if (saveHistory) {
    bot.api.config.use(async (prev, method, payload, signal) => {
      const response = await prev(method, payload, signal)
      if (
        response.ok &&
        (method.startsWith('send') || method === 'forwardMessage')
      ) {
        const messages: unknown[] = Array.isArray(response.result)
          ? response.result
          : [response.result]
        await Promise.all(messages.map(enqueueBotReplyHistory))
      }
      return response
    })
  }

  return bot
}

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
 * Persist through the activity worker without counting bot replies as user activity.
 */
async function enqueueBotReplyHistory(messageLike: unknown) {
  const message = asTelegramMessage(messageLike)
  if (!message) {
    return
  }

  const chatId = parseChatId(message)
  if (!chatId) {
    return
  }

  try {
    await enqueueActivityWorker({ message, historyOnly: true })
  } catch (error) {
    // Telegram already accepted the message; do not resend it on enqueue failure.
    logger.error(
      { err: error, chatId, messageId: message.message_id },
      'bot_history.enqueue_failed',
    )
  }
}
