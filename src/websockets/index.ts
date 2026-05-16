import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi'
import type {
  APIGatewayProxyResult,
  APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda'

import {
  dynamoDeleteItem,
  dynamoPutItem,
  dynamoQuery,
  dynamoUpdateItem,
  get24hChatStats,
  getStoredChatUsers,
  logger,
} from '@tg-bot/common'

const getRequiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }

  return value
}

const connectionsTableName = getRequiredEnv('WEBSOCKET_CONNECTIONS_TABLE_NAME')
const connectionsChatIdIndexName = getRequiredEnv(
  'WEBSOCKET_CONNECTIONS_CHAT_ID_INDEX_NAME',
)
const connectionTtlSeconds = 60 * 60 * 24 * 7
let clientEndpoint = ''
let client: ApiGatewayManagementApiClient | undefined

type Connection = {
  connectionId: string
  date?: number
  chatId?: string
  ttl?: number
}

type BroadcastEvent = {
  chatId?: string
}

const ok = (): APIGatewayProxyResult => ({ statusCode: 200, body: '' })

const badRequest = (message: string): APIGatewayProxyResult => ({
  statusCode: 400,
  body: JSON.stringify({ message }),
})

const getExpiresAt = () => Math.floor(Date.now() / 1000) + connectionTtlSeconds

const normalizeChatId = (chatId: string | number) => {
  const numericChatId = Number(chatId)

  return Number.isFinite(numericChatId) ? String(numericChatId) : undefined
}

const getClient = (endpoint: string) => {
  const endpointUrl = `https://${endpoint}`
  if (client && clientEndpoint === endpointUrl) {
    return client
  }

  clientEndpoint = endpointUrl
  client = new ApiGatewayManagementApiClient({ endpoint: endpointUrl })

  return client
}

const parseStatsBody = (body: string | null | undefined) => {
  try {
    return JSON.parse(body || '{}') as { chatId?: string | number }
  } catch {
    return {}
  }
}

const isGoneConnectionError = (error: unknown) => {
  const awsError = error as {
    name?: string
    $metadata?: {
      httpStatusCode?: number
    }
  }

  return (
    awsError.name === 'GoneException' ||
    awsError.$metadata?.httpStatusCode === 410
  )
}

const sendEvent = async (
  connectionId: string,
  endpoint: string,
  data?: unknown,
) => {
  const client = getClient(endpoint)
  const payload = typeof data === 'string' ? data : JSON.stringify(data ?? '')

  return client.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: payload,
    }),
  )
}

const saveConnection = (connection: Connection) =>
  dynamoPutItem({
    TableName: connectionsTableName,
    Item: {
      ...connection,
      date: connection.date ?? Date.now(),
      ttl: getExpiresAt(),
    },
  })

const removeConnection = (connectionId: string) =>
  dynamoDeleteItem({
    TableName: connectionsTableName,
    Key: { connectionId },
  })

const getConnections = (chatId: string) =>
  dynamoQuery({
    TableName: connectionsTableName,
    IndexName: connectionsChatIdIndexName,
    KeyConditionExpression: 'chatId = :chatId',
    ExpressionAttributeValues: { ':chatId': chatId },
  }).then((result) => (result.Items ?? []) as Connection[])

const subscribeConnectionToChat = (connectionId: string, chatId: string) =>
  dynamoUpdateItem({
    TableName: connectionsTableName,
    Key: { connectionId },
    UpdateExpression: 'SET chatId = :chatId, #ttl = :ttl',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':chatId': chatId,
      ':ttl': getExpiresAt(),
    },
  })

const sendStatsToConnection = async (
  connectionId: string,
  endpoint: string,
  data: unknown,
) => {
  try {
    await sendEvent(connectionId, endpoint, data)
  } catch (error) {
    if (isGoneConnectionError(error)) {
      await removeConnection(connectionId)
      return
    }

    throw error
  }
}

export const connect = async (
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResult> => {
  const { connectionId } = event.requestContext
  if (!connectionId) {
    return badRequest('missing connection id')
  }

  await saveConnection({ connectionId, date: Date.now() })
  return ok()
}

export const disconnect = async (
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResult> => {
  const { connectionId } = event.requestContext
  if (!connectionId) {
    return badRequest('missing connection id')
  }

  await removeConnection(connectionId)
  return ok()
}

export const stats = async (
  event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyResult> => {
  const { connectionId, domainName, stage } = event.requestContext
  if (!connectionId || !domainName || !stage) {
    return badRequest('missing websocket request context')
  }

  const { chatId } = parseStatsBody(event.body)
  if (!chatId) {
    return badRequest('missing chat id')
  }

  const normalizedChatId = normalizeChatId(chatId)
  if (!normalizedChatId) {
    return badRequest('invalid chat id')
  }

  const subscription = subscribeConnectionToChat(connectionId, normalizedChatId)
  const [usersData, historicalData] = await Promise.all([
    get24hChatStats(normalizedChatId),
    getStoredChatUsers(normalizedChatId),
  ])
  await subscription

  await sendStatsToConnection(connectionId, `${domainName}/${stage}`, {
    usersData,
    historicalData,
  })

  return ok()
}

export const broadcastStats = async (event: BroadcastEvent): Promise<void> => {
  const broadcastEndpoint = getRequiredEnv('WEBSOCKET_BROADCAST_ENDPOINT')
  const chatId = event.chatId
  const normalizedChatId = chatId ? normalizeChatId(chatId) : undefined

  if (!normalizedChatId) {
    return
  }

  const connections = await getConnections(normalizedChatId)
  if (connections.length === 0) {
    return
  }

  const [usersData, historicalData] = await Promise.all([
    get24hChatStats(normalizedChatId).catch(() => []),
    getStoredChatUsers(normalizedChatId).catch(() => []),
  ])

  const results = await Promise.allSettled(
    connections.map((connection) =>
      sendStatsToConnection(connection.connectionId, broadcastEndpoint, {
        usersData,
        historicalData,
      }),
    ),
  )
  const failedDeliveries = results.filter(
    (result) => result.status === 'rejected',
  )

  if (failedDeliveries.length > 0) {
    logger.error(
      { chatId: normalizedChatId, count: failedDeliveries.length },
      'websocket.broadcast.failed_deliveries',
    )
  }
}
