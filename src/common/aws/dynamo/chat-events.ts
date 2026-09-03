import type { Chat, User } from 'grammy/types'

import { STATISTICS_TIME_ZONE } from '../../constants'
import { logger } from '../../logger'
import type { ChatEvent } from '../../types'
import {
  dynamoCountAll,
  dynamoGetItem,
  dynamoQueryAll,
  dynamoTransactWrite,
  getOptionalEnv,
  getUserName,
  invokeLambda,
  isOffline,
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
  return isOffline() && process.env.ENABLE_LOCAL_WEBSOCKET_BROADCAST !== 'true'
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
 * A failed transaction response does not mean nothing committed: the writes
 * may have landed while our abort fired first. Without a check, the SQS
 * retry observes the conditional event insert as a duplicate and skips the
 * broadcast below, leaving statistics clients stale until the next message.
 * The event item is this message's idempotency key, so a consistent read of
 * it tells unambiguously whether our transaction committed.
 */
async function didActivityTransactionCommit(
  chatId: string,
  date: number,
  messageId?: number,
): Promise<boolean> {
  try {
    const result = await dynamoGetItem({
      TableName: CHAT_EVENTS_TABLE_NAME,
      Key: { chatId, date: getChatEventSortKey(date, messageId) },
      ConsistentRead: true,
    })
    return Boolean(result.Item)
  } catch {
    return false
  }
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

    if (!(await didActivityTransactionCommit(chatId, date, messageId))) {
      throw error
    }
    logger.info({ chatId, messageId }, 'activity.committed_before_timeout')
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

const zoneParts = (utcMs: number) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: STATISTICS_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(utcMs)
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value)
  return {
    year: value('year'),
    month: value('month') - 1,
    day: value('day'),
    hour: value('hour') % 24,
    minute: value('minute'),
    second: value('second'),
  }
}

/** Offset of the statistics zone at a given instant, in milliseconds. */
const zoneOffset = (utcMs: number) => {
  const local = zoneParts(utcMs)
  return (
    Date.UTC(
      local.year,
      local.month,
      local.day,
      local.hour,
      local.minute,
      local.second,
    ) -
    Math.floor(utcMs / 1000) * 1000
  )
}

/**
 * Instant at which the given local calendar date starts. Resolved twice because
 * the offset guessed from the wall clock can belong to the other side of a DST
 * transition; the second pass uses the offset in force at the real instant.
 */
const startOfZonedDate = (year: number, month: number, day: number) => {
  const wallClock = Date.UTC(year, month, day)
  return wallClock - zoneOffset(wallClock - zoneOffset(wallClock))
}

/**
 * Buckets each range is drawn from: 24 hours, 7 days, 30 days, 12 months.
 * Hours are absolute, days and months follow the statistics zone calendar, so a
 * daily bucket is 23 or 25 hours long across a DST change.
 */
export function getMessageCountBuckets(
  range: MessageCountRange,
  now = Date.now(),
): MessageCountBucket[] {
  if (range === 'day') {
    const end = Math.floor(now / HOUR) * HOUR + HOUR
    return Array.from({ length: 24 }, (_, index) => {
      const from = end - (24 - index) * HOUR
      return { from, to: from + HOUR }
    })
  }

  const today = zoneParts(now)
  if (range === 'week' || range === 'month') {
    const days = range === 'week' ? 7 : 30
    return Array.from({ length: days }, (_, index) => ({
      from: startOfZonedDate(
        today.year,
        today.month,
        today.day - (days - 1 - index),
      ),
      to: startOfZonedDate(
        today.year,
        today.month,
        today.day - (days - 2 - index),
      ),
    }))
  }

  return Array.from({ length: 12 }, (_, index) => ({
    from: startOfZonedDate(today.year, today.month - (11 - index), 1),
    to: startOfZonedDate(today.year, today.month - (10 - index), 1),
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
