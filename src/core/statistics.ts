import { find, orderBy } from 'lodash'
import ChatStatistic from '../models/chat-statistic'

import { segments } from '../'
import { dedent } from '../utils'

interface IUserInfo {
  username?: string
  first_name?: string
  last_name?: string
  id: number
}

interface IChatStat {
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

const getChatStatistic = (chat_id: string): any => ChatStatistic.findOne({ chat_id })

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

export const getFormattedChatStatistic = async (chat_id: string) => {
  try {
    const result = await getChatStatistic(chat_id)
    const stats = orderBy(result.users, 'msgCount', 'desc')
    const messagesCount = stats.reduce((a, b) => a + b.msgCount, 0)
    const formattedUsers = stats.map(user =>
      `${user.msgCount} (${((user.msgCount / messagesCount) * 100).toFixed(2)}%) - ${user.username}`)
    return dedent`Users Statistic:
            All messages: ${messagesCount}
            ${formattedUsers.join('\n')}`

  } catch (e) {
    segments.querySegment.addError(e)
    return 'Error while fetching statistic'
  }
}

export const getUsersList = async (chat_id: string, query: string) => {
  try {
    const result = await getChatStatistic(chat_id)
    return result.users.map((user: IUserStat) =>
      `@${user.username}`).join(' ').concat('\n') + query
  } catch (e) {
    segments.querySegment.addError(e)
    return 'Error while fetching users'
  }
}
