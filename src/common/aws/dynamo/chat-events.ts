import { chain, random, groupBy } from 'lodash'
import type { User } from 'telegram-typings'

import { dynamoPutItem, dynamoQuery, invokeLambda } from '../../utils'
import { ChatEvent } from '../../types'

const BROADCAST_LAMBDA_NAME = `telegram-websockets-${process.env.stage}-broadcastStats`
const BROADCAST_ENDPOINT =
  '97cq41uoj7.execute-api.eu-central-1.amazonaws.com/prod'

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

    const broadcastLambdaPayload = {
      queryStringParameters: {
        chatId: String(chat_id),
        endpoint: BROADCAST_ENDPOINT,
      },
    }

    await Promise.all([
      dynamoPutItem(params),
      invokeLambda(BROADCAST_LAMBDA_NAME, broadcastLambdaPayload),
    ])
  }
}

const DAY = 1000 * 60 * 60 * 24

export const get24hChatStats = async (
  chatId: string | number,
): Promise<User[]> => {
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

  const groupedMessages = groupBy(data, (x) => x.userInfo.id)

  return chain(data)
    .map((x) => x.userInfo)
    .uniqBy('id')
    .map((x) => ({ ...x, messages: groupedMessages[x.id].length }))
    .orderBy('messages', 'desc')
    .value()
}
