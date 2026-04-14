import type { Chat, User } from 'telegram-typings'

import { logger } from '../../logger'
import type { UserStat } from '../../types'
import { dedent, dynamoPutItem, dynamoQuery, getUserName } from '../../utils'

interface ChatStat {
  users: UserStat[]
  id: string
}

const readChatUsers = async (chat_id: number | string): Promise<UserStat[]> => {
  const result = await getChatStatistic(chat_id)
  return result?.users ?? []
}

const getChatStatistic = async (
  chat_id: number | string,
): Promise<ChatStat> => {
  const params = {
    TableName: 'chat-statistics',
    ExpressionAttributeValues: { ':chatId': String(chat_id) },
    KeyConditionExpression: 'chatId = :chatId',
  }

  const result = await dynamoQuery(params)
  return result.Items?.[0] as ChatStat
}

export const getChatUsers = async (
  chat_id: number | string,
): Promise<UserStat[]> => {
  try {
    return await readChatUsers(chat_id)
  } catch (error) {
    logger.error({ error }, 'Error while fetching chat users')
    return []
  }
}

export const getChatUsersOrThrow = (chat_id: number | string) =>
  readChatUsers(chat_id)

export const getUsersList = async (
  chat_id: number | string,
  query: string,
): Promise<string> => {
  try {
    const users = await getChatUsersOrThrow(chat_id)
    const mentions = users
      .map((user: UserStat) => `@${user.username}`)
      .join(' ')
    return mentions ? `${mentions}\n${query}` : query
  } catch (_e) {
    return 'Error while fetching users'
  }
}

export const getFormattedChatStatistics = async (
  chat_id: number | string,
): Promise<string> => {
  try {
    const result = await getChatStatistic(chat_id)
    const stats = result?.users?.sort((a, b) => b.msgCount - a.msgCount) || []
    const allMessagesCount = stats.reduce((a, b) => a + b.msgCount, 0)

    const formattedUsers = stats.map((user) => {
      const messagesCount = user.msgCount.toLocaleString()
      const messagePercentage = (user.msgCount / allMessagesCount) * 100

      return `${messagesCount} (${messagePercentage.toFixed(2)}%) - ${user.username}`
    })

    return dedent`Users Statistic:
            All messages: ${allMessagesCount.toLocaleString()}
            ${formattedUsers.join('\n')}`
  } catch (e) {
    logger.error({ error: e }, 'Error while fetching statistic')
    return 'Error while fetching statistic'
  }
}

export const updateStatistics = async (userInfo?: User, chat?: Chat) => {
  const chat_id = chat?.id

  if (userInfo && chat_id) {
    const chatStatistics = await getChatStatistic(chat_id)
    const statistics = chatStatistics
      ? { ...chatStatistics, chatInfo: chat }
      : {
          chatId: String(chat_id),
          users: [] as UserStat[],
          chatInfo: chat,
        }

    let userStatistic: UserStat | undefined = statistics.users?.find(
      (x) => x.id === userInfo.id,
    )

    if (!userStatistic) {
      userStatistic = {
        id: userInfo.id,
        msgCount: 1,
        username: getUserName(userInfo),
      }
      statistics.users = [...(statistics.users || []), userStatistic]
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
