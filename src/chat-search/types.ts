import type { Chat } from 'grammy/types'

type PublicChat = Chat & {
  id: number
  type: Exclude<NonNullable<Chat['type']>, 'private'>
}

export type ChatStatisticsRecord = {
  chatInfo?: Chat
}

export type SearchableChatStatisticsRecord = ChatStatisticsRecord & {
  chatInfo: PublicChat
}
