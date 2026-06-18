import type { User } from 'grammy/types'

export interface UserStat {
  id: number
  msgCount: number
  username: string
  optedOut?: boolean
}

export interface ChatEvent {
  chatId: number
  date: number
  userInfo: User
}
