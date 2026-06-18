import type { Chat, User } from 'grammy/types'

import { logger } from '../../logger'
import type { UserStat } from '../../types'
import { dedent, dynamoPutItem, dynamoQuery, getUserName } from '../../utils'

interface ChatStat {
  chatId: string
  chatInfo?: Chat
  users: UserStat[]
}

export interface FormattedChatStatistics {
  text: string
  richMarkdown: string
}

const RICH_STATISTICS_ROW_LIMIT = 100

const isUserStat = (value: unknown): value is UserStat =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Partial<UserStat>).id === 'number' &&
  typeof (value as Partial<UserStat>).msgCount === 'number' &&
  typeof (value as Partial<UserStat>).username === 'string'

const toChatStat = (value: unknown): ChatStat | undefined => {
  const chatStat = value as Partial<ChatStat> | null
  if (
    typeof chatStat !== 'object' ||
    chatStat === null ||
    typeof chatStat.chatId !== 'string'
  ) {
    return undefined
  }

  return {
    chatId: chatStat.chatId,
    chatInfo: chatStat.chatInfo,
    users: Array.isArray(chatStat.users)
      ? chatStat.users.filter(isUserStat)
      : [],
  }
}

const readChatUsers = async (chat_id: number | string): Promise<UserStat[]> =>
  (await getChatStatistic(chat_id))?.users ?? []

const getChatStatistic = async (
  chat_id: number | string,
): Promise<ChatStat | undefined> => {
  const params = {
    TableName: 'chat-statistics',
    ExpressionAttributeValues: { ':chatId': String(chat_id) },
    KeyConditionExpression: 'chatId = :chatId',
  }

  const result = await dynamoQuery(params)
  return toChatStat(result.Items?.[0])
}

export const getChatUsers = async (
  chat_id: number | string,
): Promise<UserStat[]> => {
  try {
    return await readChatUsers(chat_id)
  } catch (error) {
    logger.error(
      { chatId: String(chat_id), error },
      'Error while fetching chat users',
    )
    return []
  }
}

export const getStoredChatUsers = (chat_id: number | string) =>
  readChatUsers(chat_id)

export const setUserOptOut = async (
  chat_id: number | string,
  user_id: number,
  optedOut: boolean,
): Promise<'updated' | 'no_chat' | 'no_user' | 'already_set'> => {
  const chatStatistics = await getChatStatistic(chat_id)

  if (!chatStatistics) {
    return 'no_chat'
  }

  const user = chatStatistics.users.find((u) => u.id === user_id)

  if (!user) {
    return 'no_user'
  }

  if (Boolean(user.optedOut) === optedOut) {
    return 'already_set'
  }

  // Legacy users[] storage intentionally stays read-modify-write in this PR.
  // Moving it to atomic map updates needs a separate data-shape change.
  user.optedOut = optedOut
  await dynamoPutItem({ TableName: 'chat-statistics', Item: chatStatistics })
  return 'updated'
}

export const getUsersList = async (
  chat_id: number | string,
  query: string,
): Promise<string> => {
  try {
    const users = await getStoredChatUsers(chat_id)
    const mentions = users
      .map((user: UserStat) => `@${user.username}`)
      .join(' ')
    return [mentions, query].filter(Boolean).join('\n')
  } catch (_e) {
    return 'Error while fetching users'
  }
}

function getMessagePercentage(messageCount: number, allMessagesCount: number) {
  return allMessagesCount > 0 ? (messageCount / allMessagesCount) * 100 : 0
}

function escapeRichMarkdownTableCell(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, ' ')
    .trim()
}

export function buildFormattedChatStatisticsMessages(
  users: UserStat[],
): FormattedChatStatistics {
  const stats = [...users].sort((a, b) => b.msgCount - a.msgCount)
  const allMessagesCount = stats.reduce((a, b) => a + b.msgCount, 0)

  const formattedUsers = stats.map((user) => {
    const messagesCount = user.msgCount.toLocaleString()
    const messagePercentage = getMessagePercentage(
      user.msgCount,
      allMessagesCount,
    )

    return `${messagesCount} (${messagePercentage.toFixed(2)}%) - ${user.username}`
  })

  const visibleRichStats = stats.slice(0, RICH_STATISTICS_ROW_LIMIT)
  const richRows = visibleRichStats.map((user) => {
    const messagePercentage = getMessagePercentage(
      user.msgCount,
      allMessagesCount,
    )

    return [
      escapeRichMarkdownTableCell(user.username),
      user.msgCount.toLocaleString(),
      `${messagePercentage.toFixed(2)}%`,
    ].join(' | ')
  })
  const richLines = [
    '# Users Statistic',
    '',
    `**All messages:** ${allMessagesCount.toLocaleString()}`,
    '',
    '| User | Messages | Share |',
    '|:-----|---------:|------:|',
    ...richRows.map((row) => `| ${row} |`),
  ]

  if (stats.length > visibleRichStats.length) {
    richLines.push(
      '',
      `Showing top ${visibleRichStats.length} of ${stats.length} users.`,
    )
  }

  return {
    text: dedent`Users Statistic:
            All messages: ${allMessagesCount.toLocaleString()}
            ${formattedUsers.join('\n')}`,
    richMarkdown: richLines.join('\n'),
  }
}

export const getFormattedChatStatisticsMessages = async (
  chat_id: number | string,
): Promise<FormattedChatStatistics> => {
  try {
    const result = await getChatStatistic(chat_id)
    return buildFormattedChatStatisticsMessages(result?.users ?? [])
  } catch (e) {
    logger.error({ error: e }, 'Error while fetching statistic')
    return {
      text: 'Error while fetching statistic',
      richMarkdown: 'Error while fetching statistic',
    }
  }
}

export const getFormattedChatStatistics = async (
  chat_id: number | string,
): Promise<string> => (await getFormattedChatStatisticsMessages(chat_id)).text

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
