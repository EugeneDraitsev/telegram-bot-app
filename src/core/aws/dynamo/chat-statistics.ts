import { find, orderBy } from 'lodash'
import { dedent, dynamoPutItem, dynamoQuery } from '../../../utils'
import { getUserName, IUserInfo, IUserStat } from '.'

const getChatStatistic = async (chat_id: number) => {
  const params = {
    TableName: 'chat-statistics',
    ExpressionAttributeValues: { ':chatId': String(chat_id) },
    KeyConditionExpression: 'chatId = :chatId',
  }

  const result = await dynamoQuery(params) as any
  return result.Items[0]
}

export const getUsersList = async (chat_id: number, query: string) => {
  try {
    const result = await getChatStatistic(chat_id)
    return result.users.map((user: IUserStat) =>
      `@${user.username}`).join(' ').concat('\n') + query
  } catch (e) {
    return 'Error while fetching users'
  }
}

export const getFormattedChatStatistics = async (chat_id: number) => {
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
    console.log(e) // eslint-disable-line no-console
    return 'Error while fetching statistic'
  }
}

export const updateStatistics = async (userInfo: IUserInfo, chat_id: number) => {
  if (userInfo) {
    const chatStatistics = await getChatStatistic(chat_id)
    const statistics = chatStatistics || { chatId: String(chat_id), users: [] as IUserStat[] }


    let userStatistic = find(statistics.users, { id: userInfo.id }) as IUserStat

    if (!userStatistic) {
      userStatistic = { id: userInfo.id, msgCount: 1, username: getUserName(userInfo) }
      statistics.users.push(userStatistic)
    } else {
      userStatistic.msgCount += 1
      userStatistic.username = getUserName(userInfo)
    }

    const params = {
      TableName: 'chat-statistics',
      Item: statistics,
    }

    return dynamoPutItem(params)
  }

  return Promise.resolve()
}
