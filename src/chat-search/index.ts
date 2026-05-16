import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda'
import type { Chat } from 'telegram-typings'

import { dynamoScan, logger } from '@tg-bot/common'

const defaultAllowedOrigins = [
  'https://telegram-bot-ui.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]
const searchScanPageLimit = 100
const searchScanMaxPages = 10
const searchScanMaxItems = searchScanPageLimit * searchScanMaxPages

const allowedOrigins = new Set(
  (
    process.env.CHAT_SEARCH_ALLOWED_ORIGINS ||
    process.env.CHAT_SEARCH_ALLOWED_ORIGIN ||
    defaultAllowedOrigins.join(',')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

const getCorsHeaders = (origin?: string) => ({
  'Access-Control-Allow-Origin':
    origin && allowedOrigins.has(origin) ? origin : defaultAllowedOrigins[0],
  'Access-Control-Allow-Headers': 'X-Requested-With',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  Vary: 'Origin',
})

type ChatStatisticsRecord = {
  chatInfo?: Chat
}

const getRequestOrigin = (event: Parameters<APIGatewayProxyHandler>[0]) =>
  event.headers.origin ?? event.headers.Origin

const badRequest = (
  message: string,
  origin?: string,
): APIGatewayProxyResult => ({
  statusCode: 400,
  headers: getCorsHeaders(origin),
  body: JSON.stringify({ message }),
})

const getSearchText = ({ chatInfo }: ChatStatisticsRecord) =>
  [
    chatInfo?.title,
    chatInfo?.username,
    chatInfo?.first_name,
    chatInfo?.last_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

const isSearchableChat = (
  chat: ChatStatisticsRecord,
): chat is ChatStatisticsRecord & { chatInfo: Chat & { id: number } } =>
  typeof chat.chatInfo?.id === 'number' && chat.chatInfo.type !== 'private'

const getChats = () =>
  dynamoScan<ChatStatisticsRecord>(
    {
      TableName: 'chat-statistics',
      ProjectionExpression: 'chatInfo',
      Limit: searchScanPageLimit,
    },
    { maxItems: searchScanMaxItems, maxPages: searchScanMaxPages },
  )

export const getChatByName: APIGatewayProxyHandler = async (event) => {
  const origin = getRequestOrigin(event)

  try {
    const name = event.queryStringParameters?.name
    const normalizedName = name?.trim().toLowerCase()

    if (!normalizedName || normalizedName.length < 3) {
      return badRequest('you should specify chat name', origin)
    }

    const chats = await getChats()
    const matchedChats = chats
      .filter(isSearchableChat)
      .filter((chat) => getSearchText(chat).includes(normalizedName))
      .map((chat) => chat.chatInfo)

    return {
      statusCode: 200,
      headers: getCorsHeaders(origin),
      body: JSON.stringify(matchedChats),
    }
  } catch (error) {
    logger.error({ err: error }, 'chat_search.failed')
    return { statusCode: 500, headers: getCorsHeaders(origin), body: '' }
  }
}
