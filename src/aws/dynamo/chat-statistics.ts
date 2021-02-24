import { find, orderBy, first } from 'lodash'
import { DocumentClient } from 'aws-sdk/lib/dynamodb/document_client'
import { Chat, User } from 'telegram-typings'

import { dedent, dynamoPutItem, dynamoQuery, getUserName } from '../../utils'
import { UserStat } from '../../types'

interface ChatStat {
  users: UserStat[]
  id: string
}

const getChatStatistic = async (chat_id: number | string): Promise<ChatStat> => {
  const params = {
    TableName: 'chat-statistics',
    ExpressionAttributeValues: { ':chatId': String(chat_id) },
    KeyConditionExpression: 'chatId = :chatId',
  }

  const result = await dynamoQuery(params)
  return first(result.Items) as ChatStat
}

export const getUsersList = async (chat_id: number | string, query: string): Promise<string> => {
  try {
    const result = await getChatStatistic(chat_id)
    return (
      result.users
        .map((user: UserStat) => `@${user.username}`)
        .join(' ')
        .concat('\n') + query
    )
  } catch (e) {
    return 'Error while fetching users'
  }
}

export const getFormattedChatStatistics = async (chat_id: number | string): Promise<string> => {
  try {
    const result = await getChatStatistic(chat_id)
    const stats = orderBy(result.users, 'msgCount', 'desc')
    const messagesCount = stats.reduce((a, b) => a + b.msgCount, 0)
    const formattedUsers = stats.map(
      (user) =>
        `${user.msgCount} (${((user.msgCount / messagesCount) * 100).toFixed(2)}%) - ${
          user.username
        }`,
    )
    return dedent`Users Statistic:
            All messages: ${String(messagesCount)}
            ${formattedUsers.join('\n')}`
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    return 'Error while fetching statistic'
  }
}

type UpdateStatisticsOutput = Promise<void | DocumentClient.PutItemOutput>

export const updateStatistics = async (userInfo?: User, chat?: Chat): UpdateStatisticsOutput => {
  const chat_id = chat?.id

  if (userInfo && chat_id) {
    const chatStatistics = await getChatStatistic(chat_id)
    const statistics = chatStatistics || { chatId: String(chat_id), users: [] as UserStat[] }

    let userStatistic = find(statistics.users, { id: userInfo.id }) as UserStat

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
