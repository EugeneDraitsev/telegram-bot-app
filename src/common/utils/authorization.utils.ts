import type { Api } from 'grammy'
import type { Message } from 'grammy/types'

export type ChatAdminApi = Pick<Api, 'getChatMember'>

export async function isMessageAuthorChatAdmin(
  message: Message | undefined,
  api?: ChatAdminApi,
): Promise<boolean> {
  const chatId = message?.chat?.id
  const userId = message?.from?.id
  if (!chatId || !userId) {
    return false
  }

  if (message.chat.type === 'private') {
    return true
  }

  if (!api) {
    return false
  }

  try {
    const member = await api.getChatMember(chatId, userId)
    return member.status === 'creator' || member.status === 'administrator'
  } catch {
    return false
  }
}
