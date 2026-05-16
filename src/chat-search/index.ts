import type { APIGatewayProxyHandler, APIGatewayProxyResult } from 'aws-lambda'

import { dynamoScan, logger } from '@tg-bot/common'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Headers': 'X-Requested-With',
}

type ChatInfo = {
  id?: number
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

type ChatStatisticsRecord = {
  chatName?: string
  chatInfo?: ChatInfo
}

const chatCacheTtlMs = 2 * 60 * 1000
let chatCache:
  | {
      expiresAt: number
      chats: ChatStatisticsRecord[]
    }
  | undefined

const badRequest = (message: string): APIGatewayProxyResult => ({
  statusCode: 400,
  headers: corsHeaders,
  body: JSON.stringify({ message }),
})

const getSearchText = ({ chatInfo, chatName }: ChatStatisticsRecord) =>
  [
    chatName,
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
): chat is ChatStatisticsRecord & { chatInfo: ChatInfo & { id: number } } =>
  typeof chat.chatInfo?.id === 'number'

const getCachedChats = async () => {
  const now = Date.now()
  if (chatCache && chatCache.expiresAt > now) {
    return chatCache.chats
  }

  const chats = await dynamoScan<ChatStatisticsRecord>({
    TableName: 'chat-statistics',
  })
  chatCache = {
    chats,
    expiresAt: now + chatCacheTtlMs,
  }

  return chats
}

export const getChatByName: APIGatewayProxyHandler = async (event) => {
  try {
    const name = event.queryStringParameters?.name
    const normalizedName = name?.trim().toLowerCase()

    if (!normalizedName || normalizedName.length < 3) {
      return badRequest('you should specify chat name')
    }

    const chats = await getCachedChats()
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
    logger.error({ error }, 'chat_search.failed')
    return { statusCode: 502, headers: corsHeaders, body: '' }
  }
}
