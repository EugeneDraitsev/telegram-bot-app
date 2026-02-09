import { isAiEnabledChat } from '../utils'
import { getRedisClient } from './client'

const AGENTIC_CHAT_CONFIG_KEY = 'bot-config:agentic-chats'

export async function getAgenticChatIds() {
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
