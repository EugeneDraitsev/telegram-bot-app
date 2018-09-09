import { find, orderBy } from 'lodash'
import { segments } from '../../..'
import { dedent, dynamoPutItem, dynamoQuery } from '../../../utils'
import { getUserName, IUserInfo, IUserStat } from './'

export const getUsersList = async (chat_id: string, query: string, XRaySegment: any) => {
  try {
    const result = await getChatStatistic(chat_id, XRaySegment)
    return result.users.map((user: IUserStat) =>
      `@${user.username}`).join(' ').concat('\n') + query
  } catch (e) {
    segments.querySegment.addError(e)
    return 'Error while fetching users'
  }
}

const getChatStatistic = async (chat_id: string, XRaySegment: any) => {
  const params = {
    TableName: 'chat-statistics',
    ExpressionAttributeValues: { ':chatId': String(chat_id) },
    KeyConditionExpression: 'chatId = :chatId',
  }

  if (!process.env.IS_LOCAL) {
    (params as any).XRaySegment = XRaySegment
  }

  const result = await dynamoQuery(params) as any
  return result.Items[0]
}

export const getFormattedChatStatistics = async (chat_id: string, XRaySegment: any) => {
  try {
    const result = await getChatStatistic(chat_id, XRaySegment)
    const stats = orderBy(result.users, 'msgCount', 'desc')
    const messagesCount = stats.reduce((a, b) => a + b.msgCount, 0)
    const formattedUsers = stats.map(user =>
      `${user.msgCount} (${((user.msgCount / messagesCount) * 100).toFixed(2)}%) - ${user.username}`)
    return dedent`Users Statistic:
            All messages: ${messagesCount}
            ${formattedUsers.join('\n')}`

  } catch (e) {
    console.log(e) // tslint:disable-line
    segments.querySegment.addError(e)
    return 'Error while fetching statistic'
  }
}

export const updateStatistics = async (userInfo: IUserInfo, chat_id: string, XRaySegment: any) => {
  const chatStatistics = await getChatStatistic(chat_id, XRaySegment)
  const statistics = chatStatistics || { chatId: String(chat_id), users: [] as IUserStat[] }

  let userStatistic = find(statistics.users, { id: userInfo.id }) as IUserStat

  if (!userStatistic) {
    userStatistic = { id: userInfo.id, msgCount: 1, username: getUserName(userInfo) }
    statistics.users.push(userStatistic)
  } else {
    userStatistic.msgCount = userStatistic.msgCount + 1
    userStatistic.username = getUserName(userInfo)
  }

  const params = {
    TableName: 'chat-statistics',
    Item: statistics,
  }

  if (!process.env.IS_LOCAL) {
    (params as any).XRaySegment = XRaySegment
  }

  return dynamoPutItem(params)
}
