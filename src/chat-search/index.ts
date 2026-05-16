import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda'

import {
  CHAT_SEARCH_DEFAULT_ALLOWED_ORIGINS,
  dynamoScan,
  FRONTEND_BASE_URL,
  getOptionalEnv,
  logger,
} from '@tg-bot/common'
import type {
  ChatStatisticsRecord,
  SearchableChatStatisticsRecord,
} from './types'

const searchScanPageLimit = 100
const searchScanMaxPages = 10

const allowedOrigins = new Set(
  (
    getOptionalEnv('CHAT_SEARCH_ALLOWED_ORIGINS') ??
    getOptionalEnv('CHAT_SEARCH_ALLOWED_ORIGIN') ??
    CHAT_SEARCH_DEFAULT_ALLOWED_ORIGINS.join(',')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
)

const getCorsHeaders = (origin?: string) => ({
  'Access-Control-Allow-Origin':
    origin && allowedOrigins.has(origin) ? origin : FRONTEND_BASE_URL,
  Vary: 'Origin',
})

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
): chat is SearchableChatStatisticsRecord =>
  typeof chat.chatInfo?.id === 'number' && chat.chatInfo.type !== 'private'

const getChats = () =>
  dynamoScan<ChatStatisticsRecord>(
    {
      TableName: 'chat-statistics',
      ProjectionExpression: 'chatInfo',
      Limit: searchScanPageLimit,
    },
    { maxPages: searchScanMaxPages },
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
