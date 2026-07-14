import type { User } from 'grammy/types'

import { logger } from '../../logger'
import type { ChatEvent } from '../../types'
import {
  dynamoPutItem,
  dynamoQuery,
  getOptionalEnv,
  invokeLambda,
} from '../../utils'

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

export const saveEvent = async (
  userInfo?: User,
  chat_id?: number,
  command?: string,
  date = Date.now(),
  messageId?: number,
): Promise<void> => {
  if (userInfo && chat_id) {
    const event = {
      userInfo,
      date: getChatEventSortKey(date, messageId),
      chatId: String(chat_id),
      command,
    }

    const params = {
      TableName: 'chat-events',
      Item: event,
    }

    await Promise.all([
      dynamoPutItem(params),
      invokeStatsBroadcast(String(chat_id)).catch((error) =>
        logger.error(
          { chatId: String(chat_id), err: error },
          'broadcast invoke error',
        ),
      ),
    ])
  }
}

const DAY = 1000 * 60 * 60 * 24

export const get24hChatStats = async (chatId: string | number) => {
  const { Items } = await dynamoQuery({
    TableName: 'chat-events',
    KeyConditionExpression: 'chatId = :chatId AND #date > :date',
    ExpressionAttributeValues: {
      ':chatId': String(Number(chatId)),
      ':date': Date.now() - DAY,
    },
    ExpressionAttributeNames: { '#date': 'date' },
  })

  const data = Items as ChatEvent[]

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
