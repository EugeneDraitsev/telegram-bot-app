import type { User } from 'telegram-typings'

import { logger } from '../../logger'
import type { ChatEvent } from '../../types'
import {
  dynamoPutItem,
  dynamoQuery,
  getOptionalEnv,
  invokeLambda,
  random,
} from '../../utils'

const invokeStatsBroadcast = async (chatId: string) => {
  const functionName = getOptionalEnv('WEBSOCKET_BROADCAST_FUNCTION_NAME')
  if (!functionName) {
    logger.warn({ chatId }, 'websocket broadcast function is not configured')
    return
  }

  return invokeLambda({
    name: functionName,
    payload: { chatId },
    async: true,
  })
}

export const saveEvent = async (
  userInfo?: User,
  chat_id?: number,
  command?: string,
  date = Date.now(),
): Promise<void> => {
  if (userInfo && chat_id) {
    const event = {
      userInfo,
      // trying to avoid lost messages
      date: date * 1000 + random(-500, 500),
      chatId: String(chat_id),
      command,
    }

    const params = {
      TableName: 'chat-events',
      Item: event,
    }

    await dynamoPutItem(params)
    await invokeStatsBroadcast(String(chat_id)).catch((error) =>
      logger.error(
        { chatId: String(chat_id), err: error },
        'broadcast invoke error',
      ),
    )
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
