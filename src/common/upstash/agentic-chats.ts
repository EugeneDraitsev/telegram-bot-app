import { isAiEnabledChat } from '../utils'
import { getRedisClient } from './client'

const AGENTIC_CHAT_CONFIG_KEY = 'bot-config:agentic-chats'

export async function getAgenticChatIds(): Promise<string[]> {
  const redis = getRedisClient()
  if (!redis) {
    return []
  }

  try {
    const raw = await redis.get<string>(AGENTIC_CHAT_CONFIG_KEY)
    if (!raw) {
      return []
    }

    return (JSON.parse(raw) as { chatIds?: string[] }).chatIds ?? []
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
