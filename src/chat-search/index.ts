import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda'
import type { Chat } from 'telegram-typings'

import { dynamoScan, logger } from '@tg-bot/common'

const chatSearchAllowedOrigin =
  process.env.CHAT_SEARCH_ALLOWED_ORIGIN || 'https://telegram-bot-ui.vercel.app'
const searchScanPageLimit = 100
const searchScanMaxPages = 10
const searchScanMaxItems = searchScanPageLimit * searchScanMaxPages

const corsHeaders = {
  'Access-Control-Allow-Origin': chatSearchAllowedOrigin,
  'Access-Control-Allow-Headers': 'X-Requested-With',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
}

type ChatStatisticsRecord = {
  chatInfo?: Chat
}

const badRequest = (message: string): APIGatewayProxyResult => ({
  statusCode: 400,
  headers: corsHeaders,
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
  try {
    const name = event.queryStringParameters?.name
    const normalizedName = name?.trim().toLowerCase()

    if (!normalizedName || normalizedName.length < 3) {
      return badRequest('you should specify chat name')
    }

    const chats = await getChats()
    const matchedChats = chats
      .filter(isSearchableChat)
      .filter((chat) => getSearchText(chat).includes(normalizedName))
      .map((chat) => chat.chatInfo)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(matchedChats),
    }
  } catch (error) {
    logger.error({ err: error }, 'chat_search.failed')
    return { statusCode: 500, headers: corsHeaders, body: '' }
  }
}
