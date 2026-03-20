/**
 * Upstash Redis chat history utilities
 * Shared between telegram-bot and agent-worker
 */

import type { Message } from 'telegram-typings'

import { isAiEnabledChat } from '../utils'
import { getRedisClient } from './client'

const ONE_HOUR = 60 * 60 * 1000
const TTL_MS = 24 * ONE_HOUR
const CHAT_HISTORY_REDIS_KEY = 'chat-history'
export const DEFAULT_AGENT_HISTORY_LIMIT = 40
export const MAX_HISTORY_TOOL_LIMIT = 200

interface FormatHistoryForDisplayOptions {
  limit?: number
  includeHeader?: boolean
  headerLabel?: string
  excludeMessageId?: number
}

function normalizeHistoryLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_AGENT_HISTORY_LIMIT
  }

  return Math.max(Math.trunc(limit ?? DEFAULT_AGENT_HISTORY_LIMIT), 1)
}

function normalizeRawHistoryLimit(limit?: number): number | undefined {
  if (!Number.isFinite(limit)) {
    return undefined
  }

  return Math.max(Math.trunc(limit ?? 1), 1)
}

function getMediaLabels(message: Message): string[] {
  const labels: string[] = []
  const sticker = message.sticker as
    | (typeof message.sticker & { is_video?: boolean; file_id?: string })
    | undefined

  if (message.photo?.length) {
    labels.push('photo')
  }
  if (sticker?.file_id) {
    labels.push(sticker.is_video ? 'video sticker' : 'sticker')
  }
  if (message.document?.file_id) {
    labels.push(
      message.document.mime_type
        ? `document (${message.document.mime_type})`
        : 'document',
    )
  }
  if (message.animation?.file_id) {
    labels.push('animation')
  }
  if (message.voice?.file_id) {
    labels.push('voice')
  }
  if (message.audio?.file_id) {
    labels.push('audio')
  }
  if (message.video?.file_id) {
    labels.push('video')
  }
  if (message.video_note?.file_id) {
    labels.push('video_note')
  }

  return labels
}

function getHistoryLineText(message: Message): string {
  const mediaLabels = getMediaLabels(message)
  const text = message.text || message.caption

  if (text && mediaLabels.length === 0) {
    return text
  }
  if (text) {
    return `${text} [media: ${mediaLabels.join(', ')}]`
  }
  if (mediaLabels.length > 0) {
    return `[media: ${mediaLabels.join(', ')}]`
  }

  return '[empty message]'
}

/**
 * Save a message to chat history
 */
export const saveMessage = async (message: Message, chatId?: number) => {
  const redis = getRedisClient()
  if (!redis || !chatId || !isAiEnabledChat(chatId)) {
    return
  }

  const key = `${CHAT_HISTORY_REDIS_KEY}:${chatId}`

  await redis.zadd(key, {
    score: Date.now(),
    member: JSON.stringify(message),
  })
}

async function readRawHistory(
  chatId: string | number,
  limit?: number,
): Promise<Message[]> {
  const redis = getRedisClient()
  try {
    if (!isAiEnabledChat(chatId) || !redis) {
      return []
    }

    const key = `${CHAT_HISTORY_REDIS_KEY}:${chatId}`
    const normalizedLimit = normalizeRawHistoryLimit(limit)
    const rawMessages = await redis.zrange<Message[]>(
      key,
      Date.now() - TTL_MS,
      Date.now(),
      {
        byScore: true,
      },
    )

    return normalizedLimit ? rawMessages.slice(-normalizedLimit) : rawMessages
  } catch (error) {
    console.error('Error getting raw chat history:', error)
    return []
  }
}

/**
 * Get raw message history from Redis
 */
export const getRawHistory = async (chatId: string | number) =>
  readRawHistory(chatId)

/**
 * Get recent raw message history from Redis
 */
export const getRecentRawHistory = async (
  chatId: string | number,
  limit = DEFAULT_AGENT_HISTORY_LIMIT,
) => readRawHistory(chatId, limit)

/**
 * Get formatted history for Gemini AI interactions
 */
export const getHistory = async (chatId: string | number) => {
  try {
    const rawMessages = await getRawHistory(chatId)
    return getFormattedHistory(rawMessages)
  } catch (error) {
    console.error('Error getting chat history:', error)
    return []
  }
}

/**
 * Format history for Gemini AI (used by telegram-bot)
 */
function getFormattedHistory(chatHistory: Message[]) {
  try {
    return chatHistory?.map((message) => {
      const role = message.from?.is_bot ? 'model' : 'user'
      return {
        role: role as 'user' | 'model',
        content: [{ type: 'text' as const, text: JSON.stringify(message) }],
      }
    })
  } catch (error) {
    console.error('Error parsing or formatting chat history:', error)
    return []
  }
}

/**
 * Format history for display (human-readable)
 */
export function formatHistoryForDisplay(
  messages: Message[],
  limitOrOptions:
    | number
    | FormatHistoryForDisplayOptions = DEFAULT_AGENT_HISTORY_LIMIT,
): string {
  const options =
    typeof limitOrOptions === 'number'
      ? { limit: limitOrOptions }
      : limitOrOptions
  const limit = normalizeHistoryLimit(options.limit)
  const filtered =
    typeof options.excludeMessageId === 'number'
      ? messages.filter(
          (message) => message.message_id !== options.excludeMessageId,
        )
      : messages

  const visibleMessages = filtered.slice(-limit)

  if (visibleMessages.length === 0) {
    return 'No message history available'
  }

  const formatted = visibleMessages.map((msg) => {
    const from = msg.from?.is_bot ? 'Bot' : msg.from?.first_name || 'Unknown'
    const text = getHistoryLineText(msg)
    const time = msg.date
      ? new Date(msg.date * 1000).toLocaleTimeString('ru-RU')
      : ''
    return `[${time}] ${from}: ${text.slice(0, 200)}`
  })

  if (options.includeHeader === false) {
    return formatted.join('\n')
  }

  const headerLabel = options.headerLabel || 'Recent'
  return `${headerLabel} ${visibleMessages.length} messages:\n${formatted.join('\n')}`
}

/**
 * Remove messages older than 24h (used by scheduler)
 */
export const clearOldMessages = async () => {
  const redis = getRedisClient()
  if (!redis) {
    return
  }

  const keys = await redis.keys('chat-history:*')

  for (const key of keys) {
    await redis.zremrangebyscore(key, 0, Date.now() - TTL_MS)

    const count = await redis.zcard(key)
    if (count === 0) {
      await redis.del(key)
    }
  }
}
