import { find } from 'lodash'
import ChatStatistic from '../models/chat-statistic'

import { segments } from '../'

interface IUserInfo {
  username?: string
  first_name?: string
  last_name?: string
  id: number
}

export interface IChatStat {
  chat_id: number
  users: IUserStat []
  username: string
}

interface IUserStat {
  id: number
  msgCount: number
  username: string
}

function getUserName(userInfo: IUserInfo) {
  return userInfo.username || userInfo.first_name || userInfo.last_name || String(userInfo.id)
}

export const getChatStatistic = (chat_id: string): any => ChatStatistic.findOne({ chat_id }).catch(console.log)

export const updateStatistic = (userInfo: IUserInfo, chat_id: string) => {
  return getChatStatistic(chat_id).then((chatStatistic: IChatStat) => {
    const statistic = chatStatistic || { chat_id, users: [] as IUserStat[] }
    let userStatistic: IUserStat | undefined = find(statistic.users, { id: userInfo.id })

    if (!userStatistic) {
      userStatistic = {
        id: userInfo.id,
        msgCount: 1,
        username: getUserName(userInfo),
      }
      statistic.users.push(userStatistic)
    } else {
      userStatistic.msgCount = userStatistic.msgCount + 1
      userStatistic.username = getUserName(userInfo)
    }

    return ChatStatistic
      .update({ chat_id }, { chat_id, users: statistic.users }, { upsert: true })
      .exec()
      .catch(e => segments.dbSegment.addError(e))
  })
}
