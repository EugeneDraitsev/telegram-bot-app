import { isAiEnabledChat } from '../utils'
import { getRedisClient } from './client'

const AGENTIC_CHAT_CONFIG_KEY = 'bot-config:agentic-chats'

export async function getAgenticChatIds(): Promise<string[]> {
  const redis = getRedisClient()
  if (!redis) {
    return []
  }

  try {
    const chatIds = await redis.get<string[]>(AGENTIC_CHAT_CONFIG_KEY)
    return chatIds || []
  } catch {
    return []
  }
}

export async function isAgenticChatEnabled(
  chatId?: string | number,
): Promise<boolean> {
  if (!chatId || !isAiEnabledChat(chatId)) {
    return false
  }

  return (await getAgenticChatIds()).includes(String(chatId))
}

/**
 * Toggle agentic bot for a chat.
 * Returns true if enabled, false if disabled.
 */
export async function toggleAgenticChat(
  chatId: string | number,
): Promise<{ enabled: boolean; error?: string }> {
  if (!isAiEnabledChat(chatId)) {
    return { enabled: false, error: 'AI not allowed for this chat' }
  }

  const redis = getRedisClient()
  if (!redis) {
    return { enabled: false, error: 'Redis not available' }
  }

  try {
    const chatIds = await getAgenticChatIds()
    const chatIdStr = String(chatId)
    const isEnabled = chatIds.includes(chatIdStr)

    if (isEnabled) {
      // Disable: remove from list
      const newList = chatIds.filter((id) => id !== chatIdStr)
      await redis.set(AGENTIC_CHAT_CONFIG_KEY, newList)
      return { enabled: false }
    }

    // Enable: add to list
    const newList = [...chatIds, chatIdStr]
    await redis.set(AGENTIC_CHAT_CONFIG_KEY, newList)
    return { enabled: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { enabled: false, error: message }
  }
}
