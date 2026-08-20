import type { Chat, User } from 'grammy/types'

import type {
  MessageCountPoint,
  MessageCountRange,
  UserStat,
} from '@tg-bot/common'

export type Connection = {
  connectionId: string
  date: number
  chatId?: string
  ttl?: number
}

export type ConnectionIndexRecord = Pick<Connection, 'connectionId'> & {
  chatId: string
}

export type StatsPayload = {
  chatInfo?: Pick<
    Chat,
    'id' | 'type' | 'title' | 'username' | 'first_name' | 'last_name'
  >
  usersData: Array<User & { messages: number }>
  historicalData: UserStat[]
  messageCounts: MessageCounts
}

export type MessageCounts = Record<MessageCountRange, MessageCountPoint[]>

export type StatsErrorPayload = {
  error: string
}
