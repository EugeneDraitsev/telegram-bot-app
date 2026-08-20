import type { Chat, User } from 'grammy/types'

import { logger } from '../../logger'
import type { ChatEvent } from '../../types'
import {
  dynamoCountAll,
  dynamoQueryAll,
  dynamoTransactWrite,
  getOptionalEnv,
  getUserName,
  invokeLambda,
  isTransactionConditionFailure,
} from '../../utils'
import {
  CHAT_EVENTS_TABLE_NAME,
  CHAT_USER_STATISTICS_TABLE_NAME,
} from './table-names'

const TELEGRAM_EVENT_ID_SPACE = 1_000_000

export function getChatEventSortKey(date: number, messageId?: number): number {
  const dateMs = date < 10_000_000_000 ? date * 1000 : date
  if (!Number.isInteger(messageId) || (messageId ?? -1) < 0) {
    return dateMs
  }

  const secondStartMs = Math.floor(dateMs / 1000) * 1000
  return (
    secondStartMs + ((messageId as number) % TELEGRAM_EVENT_ID_SPACE) / 1000
  )
}

export function shouldSkipStatsBroadcast(): boolean {
  return (
    process.env.IS_OFFLINE === 'true' &&
    process.env.ENABLE_LOCAL_WEBSOCKET_BROADCAST !== 'true'
  )
}

const invokeStatsBroadcast = (chatId: string) => {
  if (shouldSkipStatsBroadcast()) {
    return Promise.resolve()
  }

  const broadcastFunctionName = getOptionalEnv(
    'WEBSOCKET_BROADCAST_FUNCTION_NAME',
  )

  if (!broadcastFunctionName) {
    logger.warn({ chatId }, 'broadcast function is not configured')
    return Promise.resolve()
  }

  return invokeLambda({
    name: broadcastFunctionName,
    payload: { chatId },
    customEndpoint: true,
    async: true,
  })
}

/**
 * Record one message: store its chat event and count it for the sender.
 *
 * Both writes go in a single transaction, and the event insert is conditional
 * on its own key being free. The event sort key is derived from the message
 * date and id, so replaying the same SQS message cancels the whole transaction
 * and the counter is left alone. The event item is therefore the natural
 * idempotency key for the message — no marker keys, no extra table.
 */
export const recordChatActivity = async (params: {
  userInfo?: User
  chat?: Chat
  command?: string
  date?: number
  messageId?: number
}): Promise<{ recorded: boolean }> => {
  const { userInfo, chat, command, date = Date.now(), messageId } = params
  const chat_id = chat?.id
  if (!userInfo || !chat_id) {
    return { recorded: false }
  }

  const chatId = String(chat_id)

  try {
    await dynamoTransactWrite({
      TransactItems: [
        {
          Put: {
            TableName: CHAT_EVENTS_TABLE_NAME,
            Item: {
              userInfo,
              date: getChatEventSortKey(date, messageId),
              chatId,
              command,
            },
            ConditionExpression: 'attribute_not_exists(chatId)',
          },
        },
        {
          // ADD creates the item when the user has no row yet, so this needs
          // no read-then-branch and no existence condition of its own.
          Update: {
            TableName: CHAT_USER_STATISTICS_TABLE_NAME,
            Key: { chatId, userId: userInfo.id },
            UpdateExpression:
              'SET #username = :username, #chatInfo = :chatInfo, #updatedAt = :updatedAt ADD #msgCount :one',
            ExpressionAttributeNames: {
              '#username': 'username',
              '#chatInfo': 'chatInfo',
              '#updatedAt': 'updatedAt',
              '#msgCount': 'msgCount',
            },
            ExpressionAttributeValues: {
              ':username': getUserName(userInfo),
              ':chatInfo': chat,
              ':updatedAt': Date.now(),
              ':one': 1,
            },
          },
        },
      ],
    })
  } catch (error) {
    if (isTransactionConditionFailure(error)) {
      logger.info({ chatId, messageId }, 'activity.duplicate_skipped')
      return { recorded: false }
    }
    throw error
  }

  await invokeStatsBroadcast(chatId).catch((error) =>
    logger.error({ chatId, err: error }, 'broadcast invoke error'),
  )

  return { recorded: true }
}

const DAY = 1000 * 60 * 60 * 24

export const get24hChatStats = async (chatId: string | number) => {
  const data = await dynamoQueryAll<ChatEvent>({
    TableName: CHAT_EVENTS_TABLE_NAME,
    KeyConditionExpression: 'chatId = :chatId AND #date > :date',
    ExpressionAttributeValues: {
      ':chatId': String(Number(chatId)),
      ':date': Date.now() - DAY,
    },
    ExpressionAttributeNames: { '#date': 'date' },
  })

  const groupedData =
    data?.reduce(
      (acc, x) => {
        acc.set(x.userInfo.id, {
          ...x.userInfo,
          messages: (acc.get(x.userInfo.id)?.messages ?? 0) + 1,
        })
        return acc
      },
      new Map() as Map<number, User & { messages: number }>,
    ) ?? new Map()

  return Array.from(groupedData.values()).sort(
    (a, b) => b.messages - a.messages,
  )
}

export type MessageCountRange = 'day' | 'week' | 'month' | 'year'

export interface MessageCountPoint {
  /** Bucket start, epoch milliseconds UTC. */
  t: number
  count: number
}

interface MessageCountBucket {
  from: number
  to: number
}

const HOUR = 60 * 60 * 1000

const startOfUtcHour = (ms: number) => Math.floor(ms / HOUR) * HOUR
const startOfUtcDay = (ms: number) => Math.floor(ms / DAY) * DAY

const getFixedBuckets = (
  count: number,
  size: number,
  end: number,
): MessageCountBucket[] =>
  Array.from({ length: count }, (_, index) => {
    const from = end - (count - index) * size
    return { from, to: from + size }
  })

/** Buckets each range is drawn from: 24 hours, 7 days, 30 days, 12 months. */
export function getMessageCountBuckets(
  range: MessageCountRange,
  now = Date.now(),
): MessageCountBucket[] {
  if (range === 'day') {
    return getFixedBuckets(24, HOUR, startOfUtcHour(now) + HOUR)
  }
  if (range === 'week' || range === 'month') {
    const days = range === 'week' ? 7 : 30
    return getFixedBuckets(days, DAY, startOfUtcDay(now) + DAY)
  }

  const current = new Date(now)
  return Array.from({ length: 12 }, (_, index) => ({
    from: Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth() - (11 - index),
      1,
    ),
    to: Date.UTC(
      current.getUTCFullYear(),
      current.getUTCMonth() - (10 - index),
      1,
    ),
  }))
}

/**
 * Message counts per bucket, counted inside DynamoDB. One COUNT query per
 * bucket, all issued in parallel, so a year costs twelve small round trips
 * instead of pulling ~80k event items across the wire to length() them here.
 */
export const getChatMessageCounts = async (
  chatId: string | number,
  range: MessageCountRange,
  now = Date.now(),
): Promise<MessageCountPoint[]> => {
  const buckets = getMessageCountBuckets(range, now)
  const counts = await Promise.all(
    buckets.map(({ from, to }) =>
      dynamoCountAll({
        TableName: CHAT_EVENTS_TABLE_NAME,
        KeyConditionExpression:
          'chatId = :chatId AND #date BETWEEN :from AND :to',
        ExpressionAttributeNames: { '#date': 'date' },
        ExpressionAttributeValues: {
          ':chatId': String(Number(chatId)),
          ':from': from,
          // Sort keys carry a sub-millisecond message-id fraction, so the upper
          // bound sits just under the next bucket instead of one whole ms below.
          ':to': to - 0.001,
        },
      }),
    ),
  )

  return buckets.map((bucket, index) => ({
    t: bucket.from,
    count: counts[index],
  }))
}
