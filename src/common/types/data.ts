import type { User } from 'telegram-typings'

export interface UserStat {
  id: number
  msgCount: number
  username: string
}

export interface ChatEvent {
  chatId: number
  date: number
  userInfo: User
}
