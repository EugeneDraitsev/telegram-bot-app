export interface IUserStat {
  id: number
  msgCount: number
  username: string
}

export interface IUserInfo {
  username?: string
  first_name?: string
  last_name?: string
  id: number
}

export const getUserName = (userInfo: IUserInfo) =>
  userInfo.username || userInfo.first_name || userInfo.last_name || String(userInfo.id)
