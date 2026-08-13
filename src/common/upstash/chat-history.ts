/**
 * Upstash Redis chat history utilities
 * Shared between telegram-bot and agent-worker
 */

import type { Message } from 'grammy/types'

import { logger } from '../logger'
import { TtlCache } from '../ttl-cache'
import { isAiEnabledChat } from '../utils'
import { getRedisClient } from './client'

const ONE_HOUR = 60 * 60 * 1000
const TTL_MS = 24 * ONE_HOUR
export const CHAT_HISTORY_MAINTENANCE_INTERVAL_MS = ONE_HOUR
export const CHAT_HISTORY_PHYSICAL_TTL_SECONDS =
  (TTL_MS + CHAT_HISTORY_MAINTENANCE_INTERVAL_MS) / 1000
const CHAT_HISTORY_REDIS_KEY = 'chat-history'
export const DEFAULT_AGENT_HISTORY_LIMIT = 40
export const MAX_HISTORY_TOOL_LIMIT = 200

const historyMaintenanceCache = new TtlCache<string, true>(
  CHAT_HISTORY_MAINTENANCE_INTERVAL_MS,
)

export function clearChatHistoryMaintenanceCache(): void {
  historyMaintenanceCache.clear()
}

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
 * Score a message by when Telegram says it was sent, not by when we happened to
 * process it, tie-broken by message id. Together with ZADD NX this makes a
 * replay a true no-op instead of moving an old message to the end of history.
 *
 * The tie-breaker mirrors getChatEventSortKey: any modulo inverts the pair that
 * straddles its boundary, so it is kept wide enough that two messages one
 * second apart can never land on opposite sides of one.
 */
function getHistoryScore(message: Message): number {
  const dateMs = (message.date ?? 0) * 1000
  if (!dateMs) {
    return Date.now()
  }

  return dateMs + ((message.message_id ?? 0) % 1_000_000) / 1000
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
  const now = Date.now()

  // ZADD must finish before EXPIRE: on a new chat key, concurrent HTTP calls
  // could otherwise let EXPIRE run before Redis has created the sorted set.
  await redis.zadd(
    key,
    { nx: true },
    { score: getHistoryScore(message), member: JSON.stringify(message) },
  )

  if (historyMaintenanceCache.get(key, now)) {
    return
  }

  // High-volume chats used to pay for cleanup + expiry on every message.
  // Refresh both at most hourly per warm Lambda. The physical TTL includes the
  // maintenance interval, so the visible 24-hour window can never expire
  // early when the final write lands just before a refresh is due.
  historyMaintenanceCache.set(key, true, now)
  try {
    await Promise.all([
      redis.zremrangebyscore(key, 0, now - TTL_MS),
      redis.expire(key, CHAT_HISTORY_PHYSICAL_TTL_SECONDS),
    ])
  } catch (error) {
    historyMaintenanceCache.delete(key)
    throw error
  }
}

async function readRawHistory(
  chatId: string | number,
  limit?: number,
): Promise<Message[]> {
  const redis = getRedisClient()
  try {
    if (!redis || !isAiEnabledChat(chatId)) {
      return []
    }

    const key = `${CHAT_HISTORY_REDIS_KEY}:${chatId}`
    const normalizedLimit = normalizeRawHistoryLimit(limit)
    const now = Date.now()
    const since = now - TTL_MS
    const [from, to, options] = normalizedLimit
      ? ([
          now,
          since,
          { byScore: true, rev: true, offset: 0, count: normalizedLimit },
        ] as const)
      : ([since, now, { byScore: true }] as const)

    // The score range enforces the exact visible 24-hour window. Physical
    // retention is maintained periodically on writes.
    const rawMessages = await redis.zrange<Message[]>(key, from, to, options)

    return normalizedLimit ? rawMessages.reverse() : rawMessages
  } catch (error) {
    logger.error({ error }, 'Error getting raw chat history')
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
