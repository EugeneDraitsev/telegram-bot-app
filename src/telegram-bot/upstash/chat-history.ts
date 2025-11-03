import { Redis } from '@upstash/redis'
import type { Message } from 'telegram-typings'

import { isAiEnabledChat } from '../utils'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL,
  token: process.env.UPSTASH_REDIS_TOKEN,
})

const ONE_HOUR = 60 * 60 * 1000
const TTL_MS = 24 * ONE_HOUR
const CHAT_HISTORY_REDIS_KEY = 'chat-history'

export const saveMessage = async (message: Message, chatId?: number) => {
  if (!chatId || !isAiEnabledChat(chatId)) {
    return
  }

  const key = `${CHAT_HISTORY_REDIS_KEY}:${chatId}`

  await redis.zadd(key, {
    score: Date.now(),
    member: JSON.stringify(message),
  })
}

export const getHistory = async (chatId: string | number) => {
  try {
    if (!isAiEnabledChat(chatId)) {
      return []
    }

    const key = `${CHAT_HISTORY_REDIS_KEY}:${chatId}`

    const rawMessages = await redis.zrange<Message[]>(
      key,
      Date.now() - TTL_MS,
      Date.now(),
      { byScore: true },
    )

    return getFormattedHistory(rawMessages)
  } catch (error) {
    console.error('Error getting chat history:', error)
    return []
  }
}

// Remove messages older than 24h
export const clearOldMessages = async () => {
  const keys = await redis.keys('chat-history:*')

  for (const key of keys) {
    await redis.zremrangebyscore(key, 0, Date.now() - TTL_MS)

    const count = await redis.zcard(key)
    if (count === 0) {
      await redis.del(key)
    }
  }
}

function getFormattedHistory(chatHistory: Message[]) {
  try {
    return chatHistory?.map((message) => {
      const role = message.from?.is_bot ? 'model' : 'user'
      return {
        role: role,
        parts: [{ text: JSON.stringify(message) }],
      }
    })
  } catch (error) {
    console.error('Error parsing or formatting chat history:', error)
    return [] // Return an empty history on error
  }
}
