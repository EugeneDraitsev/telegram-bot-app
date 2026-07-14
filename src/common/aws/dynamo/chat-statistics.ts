import type { Chat, User } from 'grammy/types'

import { logger } from '../../logger'
import type { UserStat } from '../../types'
import { dedent, dynamoPutItem, dynamoQuery, getUserName } from '../../utils'
import { CHAT_STATISTICS_TABLE_NAME } from './table-names'

interface ChatStat {
  chatId: string
  chatInfo?: Chat
  users: UserStat[]
  version?: number
}

export interface FormattedChatStatistics {
  text: string
  richMarkdown: string
}

const RICH_STATISTICS_ROW_LIMIT = 100
const MAX_WRITE_ATTEMPTS = 8

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
    version:
      typeof chatStat.version === 'number' ? chatStat.version : undefined,
  }
}

const isConditionalWriteConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'ConditionalCheckFailedException'

const readChatUsers = async (chat_id: number | string): Promise<UserStat[]> =>
  (await getChatStatistic(chat_id))?.users ?? []

const getChatStatistic = async (
  chat_id: number | string,
): Promise<ChatStat | undefined> => {
  const params = {
    TableName: CHAT_STATISTICS_TABLE_NAME,
    ExpressionAttributeValues: { ':chatId': String(chat_id) },
    KeyConditionExpression: 'chatId = :chatId',
  }

  const result = await dynamoQuery(params)
  return toChatStat(result.Items?.[0])
}

interface ChatStatMutation<T> {
  result: T
  next?: ChatStat
}

async function putVersionedChatStatistic(
  current: ChatStat | undefined,
  next: ChatStat,
): Promise<void> {
  const item = { ...next, version: (current?.version ?? 0) + 1 }

  if (!current) {
    await dynamoPutItem({
      TableName: CHAT_STATISTICS_TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#chatId)',
      ExpressionAttributeNames: { '#chatId': 'chatId' },
    })
    return
  }

  const hasVersion = typeof current.version === 'number'
  await dynamoPutItem({
    TableName: CHAT_STATISTICS_TABLE_NAME,
    Item: item,
    ConditionExpression: hasVersion
      ? '#version = :expectedVersion'
      : 'attribute_not_exists(#version)',
    ExpressionAttributeNames: { '#version': 'version' },
    ...(hasVersion
      ? { ExpressionAttributeValues: { ':expectedVersion': current.version } }
      : {}),
  })
}

async function mutateChatStatistic<T>(
  chatId: string | number,
  mutate: (current: ChatStat | undefined) => ChatStatMutation<T>,
): Promise<T> {
  let lastConflict: unknown

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = await getChatStatistic(chatId)
    const mutation = mutate(current)
    if (!mutation.next) {
      return mutation.result
    }

    try {
      await putVersionedChatStatistic(current, mutation.next)
      return mutation.result
    } catch (error) {
      if (!isConditionalWriteConflict(error)) {
        throw error
      }
      lastConflict = error
    }
  }

  throw new Error(
    `Could not update chat statistics after ${MAX_WRITE_ATTEMPTS} attempts`,
    { cause: lastConflict },
  )
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
  return mutateChatStatistic(chat_id, (chatStatistics) => {
    if (!chatStatistics) {
      return { result: 'no_chat' }
    }

    const user = chatStatistics.users.find((item) => item.id === user_id)
    if (!user) {
      return { result: 'no_user' }
    }

    if (Boolean(user.optedOut) === optedOut) {
      return { result: 'already_set' }
    }

    return {
      result: 'updated',
      next: {
        ...chatStatistics,
        users: chatStatistics.users.map((item) =>
          item.id === user_id ? { ...item, optedOut } : item,
        ),
      },
    }
  })
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
    return mutateChatStatistic(chat_id, (chatStatistics) => {
      const currentUsers = chatStatistics?.users ?? []
      const existingUser = currentUsers.find((item) => item.id === userInfo.id)
      const userStatistic: UserStat = existingUser
        ? {
            ...existingUser,
            msgCount: existingUser.msgCount + 1,
            username: getUserName(userInfo),
          }
        : {
            id: userInfo.id,
            msgCount: 1,
            username: getUserName(userInfo),
          }

      return {
        result: undefined,
        next: {
          ...chatStatistics,
          chatId: String(chat_id),
          chatInfo: chat,
          users: existingUser
            ? currentUsers.map((item) =>
                item.id === userInfo.id ? userStatistic : item,
              )
            : [...currentUsers, userStatistic],
        },
      }
    })
  }

  return Promise.resolve()
}
