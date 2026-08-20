import type { Chat } from 'grammy/types'

import { logger } from '../../logger'
import type { UserStat } from '../../types'
import {
  dedent,
  dynamoBatchGetAll,
  dynamoQuery,
  dynamoQueryAll,
  dynamoUpdateItem,
} from '../../utils'
import {
  CHAT_USER_STATISTICS_TABLE_NAME,
  CHAT_USER_STATISTICS_USER_ID_INDEX_NAME,
} from './table-names'

export interface ChatStat {
  chatId: string
  chatInfo?: Chat
  users: UserStat[]
}

export interface FormattedChatStatistics {
  text: string
  richMarkdown: string
}

export interface UserChatSummary {
  chatId: string
  chatInfo?: Chat
  lastActivityAt?: number
  messageCount: number
}

const RICH_STATISTICS_ROW_LIMIT = 100
const MAX_WRITE_ATTEMPTS = 8

// Aggregate per-user counters are permanent by design: never write a ttl
// attribute here, and never enable TTL on this table.
interface StoredUserStat {
  chatId: string
  userId: number
  msgCount: number
  username: string
  optedOut?: boolean
  chatInfo?: Chat
  updatedAt?: number
}

type StoredUserChatKey = {
  chatId: string
  userId: number
}

const toStoredUserStat = (value: unknown): StoredUserStat | undefined => {
  const item = value as Partial<StoredUserStat> | null
  if (
    typeof item !== 'object' ||
    item === null ||
    typeof item.chatId !== 'string' ||
    typeof item.userId !== 'number' ||
    typeof item.msgCount !== 'number' ||
    typeof item.username !== 'string'
  ) {
    return undefined
  }

  return {
    chatId: item.chatId,
    userId: item.userId,
    msgCount: item.msgCount,
    username: item.username,
    optedOut: item.optedOut,
    chatInfo: item.chatInfo,
    updatedAt: item.updatedAt,
  }
}

const toStoredUserChatKey = (value: unknown): StoredUserChatKey | undefined => {
  const item = value as Partial<StoredUserChatKey> | null
  if (
    typeof item !== 'object' ||
    item === null ||
    typeof item.chatId !== 'string' ||
    typeof item.userId !== 'number'
  ) {
    return undefined
  }

  return {
    chatId: item.chatId,
    userId: item.userId,
  }
}

const isConditionalWriteConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'ConditionalCheckFailedException'

const getStoredUserStatistic = async (
  chatId: number | string,
  userId: number,
): Promise<StoredUserStat | undefined> => {
  const result = await dynamoQuery({
    TableName: CHAT_USER_STATISTICS_TABLE_NAME,
    ExpressionAttributeValues: {
      ':chatId': String(chatId),
      ':userId': userId,
    },
    KeyConditionExpression: 'chatId = :chatId AND userId = :userId',
  })

  return toStoredUserStat(result.Items?.[0])
}

export const hasStoredChatUser = async (
  chatId: number | string,
  userId: number,
): Promise<boolean> => Boolean(await getStoredUserStatistic(chatId, userId))

export const hasStoredChat = async (
  chatId: number | string,
): Promise<boolean> => {
  const result = await dynamoQuery({
    TableName: CHAT_USER_STATISTICS_TABLE_NAME,
    ExpressionAttributeValues: { ':chatId': String(chatId) },
    KeyConditionExpression: 'chatId = :chatId',
    Limit: 1,
    ProjectionExpression: 'chatId',
  })
  return Boolean(result.Items?.length)
}

export const getStoredUserChats = async (
  userId: number,
): Promise<UserChatSummary[]> => {
  const indexItems = await dynamoQueryAll({
    TableName: CHAT_USER_STATISTICS_TABLE_NAME,
    IndexName: CHAT_USER_STATISTICS_USER_ID_INDEX_NAME,
    ExpressionAttributeValues: { ':userId': userId },
    KeyConditionExpression: 'userId = :userId',
    ProjectionExpression: 'chatId, userId',
  })
  const keys = indexItems.flatMap((item) => {
    const key = toStoredUserChatKey(item)
    return key?.userId === userId ? [key] : []
  })
  const items = await dynamoBatchGetAll(CHAT_USER_STATISTICS_TABLE_NAME, keys)

  return items
    .flatMap((item) => {
      // Opt-out is only a /all mention preference; an observed row still
      // grants its owner access to that chat's statistics.
      const stored = toStoredUserStat(item)
      return stored
        ? [
            {
              chatId: stored.chatId,
              chatInfo: stored.chatInfo,
              lastActivityAt: stored.updatedAt,
              messageCount: stored.msgCount,
            } satisfies UserChatSummary,
          ]
        : []
    })
    .sort(
      (left, right) =>
        (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0) ||
        left.chatId.localeCompare(right.chatId),
    )
}

const getStoredUserStatistics = async (
  chatId: number | string,
): Promise<StoredUserStat[]> => {
  const items = await dynamoQueryAll({
    TableName: CHAT_USER_STATISTICS_TABLE_NAME,
    ExpressionAttributeValues: { ':chatId': String(chatId) },
    KeyConditionExpression: 'chatId = :chatId',
  })

  return items.flatMap((item) => {
    const user = toStoredUserStat(item)
    return user ? [user] : []
  })
}

const toUserStat = (item: StoredUserStat): UserStat => ({
  id: item.userId,
  msgCount: item.msgCount,
  username: item.username,
  optedOut: item.optedOut,
})

export const getStoredChatStatistics = async (
  chatId: number | string,
): Promise<ChatStat | undefined> => {
  const storedUsers = await getStoredUserStatistics(chatId)
  if (storedUsers.length === 0) {
    return undefined
  }

  const latestChatInfo = storedUsers.reduce<StoredUserStat | undefined>(
    (latest, item) =>
      item.chatInfo &&
      (item.updatedAt ?? 0) >= (latest?.updatedAt ?? Number.NEGATIVE_INFINITY)
        ? item
        : latest,
    undefined,
  )?.chatInfo

  return {
    chatId: String(chatId),
    chatInfo: latestChatInfo,
    users: storedUsers.map(toUserStat),
  }
}

export const getStoredChatUsers = async (
  chatId: number | string,
): Promise<UserStat[]> => (await getStoredChatStatistics(chatId))?.users ?? []

export const setUserOptOut = async (
  chat_id: number | string,
  user_id: number,
  optedOut: boolean,
): Promise<'updated' | 'no_chat' | 'no_user' | 'already_set'> => {
  const chatId = String(chat_id)
  let lastConflict: unknown

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const storedUser = await getStoredUserStatistic(chatId, user_id)
    if (storedUser) {
      if (Boolean(storedUser.optedOut) === optedOut) {
        return 'already_set'
      }

      try {
        await dynamoUpdateItem({
          TableName: CHAT_USER_STATISTICS_TABLE_NAME,
          Key: { chatId, userId: user_id },
          UpdateExpression: 'SET #optedOut = :optedOut',
          ConditionExpression:
            'attribute_exists(#chatId) AND attribute_exists(#userId)',
          ExpressionAttributeNames: {
            '#chatId': 'chatId',
            '#userId': 'userId',
            '#optedOut': 'optedOut',
          },
          ExpressionAttributeValues: { ':optedOut': optedOut },
        })
        return 'updated'
      } catch (error) {
        if (!isConditionalWriteConflict(error)) {
          throw error
        }
        lastConflict = error
        continue
      }
    }

    const anyStoredUsers = await dynamoQuery({
      TableName: CHAT_USER_STATISTICS_TABLE_NAME,
      ExpressionAttributeValues: { ':chatId': chatId },
      KeyConditionExpression: 'chatId = :chatId',
      Limit: 1,
    })
    return anyStoredUsers.Items?.length ? 'no_user' : 'no_chat'
  }

  throw new Error(
    `Could not update user opt-out after ${MAX_WRITE_ATTEMPTS} attempts`,
    { cause: lastConflict },
  )
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
    const result = await getStoredChatStatistics(chat_id)
    return buildFormattedChatStatisticsMessages(result?.users ?? [])
  } catch (e) {
    logger.error({ error: e }, 'Error while fetching statistic')
    return {
      text: 'Error while fetching statistic',
      richMarkdown: 'Error while fetching statistic',
    }
  }
}

// Counting a message lives in recordChatActivity: the increment shares a
// transaction with the conditional chat-event insert that makes it replay safe.
