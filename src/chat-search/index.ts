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
const corsAllowedMethods = 'GET,OPTIONS'
const corsAllowedHeaders = [
  'Content-Type',
  'X-Requested-With',
  'X-Amz-Date',
  'Authorization',
  'X-Api-Key',
  'X-Amz-Security-Token',
  'X-Amz-User-Agent',
].join(',')

const configuredAllowedOrigins = (
  getOptionalEnv('CHAT_SEARCH_ALLOWED_ORIGINS') ??
  getOptionalEnv('CHAT_SEARCH_ALLOWED_ORIGIN') ??
  CHAT_SEARCH_DEFAULT_ALLOWED_ORIGINS.join(',')
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const allowedOrigins = new Set(configuredAllowedOrigins)
const fallbackAllowedOrigin = configuredAllowedOrigins[0] ?? FRONTEND_BASE_URL

const getCorsHeaders = (origin?: string) => ({
  'Access-Control-Allow-Origin':
    origin && allowedOrigins.has(origin) ? origin : fallbackAllowedOrigin,
  Vary: 'Origin',
})

const getPreflightHeaders = (origin?: string) => ({
  ...getCorsHeaders(origin),
  'Access-Control-Allow-Methods': corsAllowedMethods,
  'Access-Control-Allow-Headers': corsAllowedHeaders,
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
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 204,
        headers: getPreflightHeaders(origin),
        body: '',
      }
    }

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
