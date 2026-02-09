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

/**
 * Get raw message history from Redis
 */
export const getRawHistory = async (
  chatId: string | number,
): Promise<Message[]> => {
  const redis = getRedisClient()
  try {
    if (!redis || !isAiEnabledChat(chatId)) {
      return []
    }

    const key = `${CHAT_HISTORY_REDIS_KEY}:${chatId}`

    const rawMessages = await redis.zrange<Message[]>(
      key,
      Date.now() - TTL_MS,
      Date.now(),
      { byScore: true },
    )

    return rawMessages || []
  } catch (error) {
    console.error('Error getting raw chat history:', error)
    return []
  }
}

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
  limit = 10,
): string {
  const limited = messages.slice(-limit)

  if (limited.length === 0) {
    return 'No message history available'
  }

  const formatted = limited.map((msg) => {
    const from = msg.from?.is_bot ? 'Bot' : msg.from?.first_name || 'Unknown'
    const text = msg.text || msg.caption || '[media]'
    const time = msg.date
      ? new Date(msg.date * 1000).toLocaleTimeString('ru-RU')
      : ''
    return `[${time}] ${from}: ${text.slice(0, 200)}`
  })

  return `Recent ${limited.length} messages:\n${formatted.join('\n')}`
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
