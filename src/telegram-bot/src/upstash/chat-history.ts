import { Redis } from '@upstash/redis'
import type { Message } from 'telegram-typings'

import { getUserName } from '@tg-bot/common'
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

  // Remove messages older than 24h
  await redis.zremrangebyscore(key, 0, Date.now() - TTL_MS)
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

// Helper function to format dates (you can customize this)
function formatDate(unixTimestamp: number) {
  const date = new Date(unixTimestamp * 1000) // Convert to milliseconds
  return date.toLocaleString() // Or format as you prefer (e.g., date.toISOString())
}

function getFormattedHistory(chatHistory: Message[]) {
  try {
    return chatHistory?.map((message) => {
      // 1. Determine the Role (User or Model)
      const role = message.from?.is_bot ? 'model' : 'user'

      // 2. Start Building the Text Content
      let textContent = ''

      // 3. Add User/Chat Information
      if (message.from) {
        textContent += `User ID: ${message.from.id} `
        const username = getUserName(message.from)
        if (username) {
          textContent += `(${username}): `
        }
      } else if (message.sender_chat) {
        textContent += `Chat ID: ${message.sender_chat.id} (${message.sender_chat.type}): `
      }

      // 4. Add the Main Message Text/Caption
      if (message.text) {
        textContent += message.text
      } else if (message.caption) {
        textContent += `[Caption] ${message.caption}` // Indicate it's a caption
      } else {
        textContent += '[Non-text message]' // Placeholder for non-text messages
      }

      // 5. Add Date/Time
      textContent += ` [${formatDate(message.date)}]`

      // 6. Handle Forwarded Messages (Simplified)
      if (message.forward_from || message.forward_from_chat) {
        textContent += ` [Forwarded from: ${message.forward_from?.id || message.forward_from_chat?.id}]`
      }

      // 7. Handle Replies (Simplified)
      if (message.reply_to_message) {
        textContent += ` [In reply to message ID: ${message.reply_to_message.message_id}]`
      }

      // 8.  Selective Inclusion of OTHER Fields (Examples)
      //     Add these *only* if they are particularly relevant to your use case.

      // Example: If it's a voice message, indicate that.
      if (message.voice) {
        textContent += ' [Voice Message]'
      }

      // Example:  If it's a sticker, indicate that.
      if (message.sticker) {
        textContent += ' [Sticker]'
      }
      // Example: If it's a poll
      if (message.poll) {
        textContent += ` [Poll: ${message.poll.question}]`
      }

      // Example: If location is shared, indicate that:
      if (message.location) {
        textContent += ` [Location Shared: Latitude ${message.location.latitude}, Longitude ${message.location.longitude}]`
      }

      // 9. Create the 'parts' object
      return {
        role: role,
        parts: [{ text: textContent }],
      }
    })
  } catch (error) {
    console.error('Error parsing or formatting chat history:', error)
    return [] // Return an empty history on error
  }
}
