import type { User } from 'telegram-typings'

import type { UserStat } from '@tg-bot/common'

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
  usersData: Array<User & { messages: number }>
  historicalData: UserStat[]
}
