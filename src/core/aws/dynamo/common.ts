export interface UserStat {
  id: number
  msgCount: number
  username: string
}

export interface UserInfo {
  username?: string
  first_name?: string
  last_name?: string
  id: number
}

export const getUserName = (userInfo?: UserInfo): string =>
  userInfo?.username || userInfo?.first_name || userInfo?.last_name || String(userInfo?.id || '')
