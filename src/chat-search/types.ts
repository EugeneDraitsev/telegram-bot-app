import type { Chat } from 'telegram-typings'

export type ChatStatisticsRecord = {
  chatInfo?: Chat
}

export type SearchableChatStatisticsRecord = ChatStatisticsRecord & {
  chatInfo: Chat & { id: number }
}
