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
  getRequiredEnv,
  getStoredChatUsers,
  logger,
} from '@tg-bot/common'
import type { Connection, StatsPayload } from './types'

const connectionsTableName = getRequiredEnv('WEBSOCKET_CONNECTIONS_TABLE_NAME')
const connectionsChatIdIndexName = getRequiredEnv(
  'WEBSOCKET_CONNECTIONS_CHAT_ID_INDEX_NAME',
)
const connectionTtlSeconds = 60 * 60 * 24
const clients = new Map<string, ApiGatewayManagementApiClient>()

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
  const cachedClient = clients.get(endpointUrl)

  if (cachedClient) {
    return cachedClient
  }

  const client = new ApiGatewayManagementApiClient({ endpoint: endpointUrl })
  clients.set(endpointUrl, client)

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

const isConditionalCheckFailedError = (error: unknown) => {
  const awsError = error as { name?: string }

  return awsError.name === 'ConditionalCheckFailedException'
}

const sendEvent = async (
  connectionId: string,
  endpoint: string,
  data: StatsPayload,
) => {
  const client = getClient(endpoint)

  return client.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: JSON.stringify(data),
    }),
  )
}

const saveConnection = (connection: Connection) =>
  dynamoPutItem({
    TableName: connectionsTableName,
    Item: {
      ...connection,
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
    ConditionExpression: 'attribute_exists(connectionId)',
    ExpressionAttributeNames: { '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':chatId': chatId,
      ':ttl': getExpiresAt(),
    },
  })

const sendStatsToConnection = async (
  connectionId: string,
  endpoint: string,
  data: StatsPayload,
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

  try {
    await subscribeConnectionToChat(connectionId, normalizedChatId)
  } catch (error) {
    if (isConditionalCheckFailedError(error)) {
      logger.warn(
        { connectionId, chatId: normalizedChatId },
        'websocket.stats.missing_connection',
      )
      return ok()
    }

    throw error
  }

  const [usersData, historicalData] = await Promise.all([
    get24hChatStats(normalizedChatId),
    getStoredChatUsers(normalizedChatId),
  ])

  await sendStatsToConnection(connectionId, `${domainName}/${stage}`, {
    usersData,
    historicalData,
  })

  return ok()
}

export const broadcastStats = async ({
  chatId,
}: {
  chatId: string
}): Promise<void> => {
  const broadcastEndpoint = getRequiredEnv('WEBSOCKET_BROADCAST_ENDPOINT')
  const normalizedChatId = normalizeChatId(chatId)

  if (!normalizedChatId) {
    return
  }

  const connections = await getConnections(normalizedChatId)
  if (connections.length === 0) {
    return
  }

  let stats: StatsPayload

  try {
    const [usersData, historicalData] = await Promise.all([
      get24hChatStats(normalizedChatId),
      getStoredChatUsers(normalizedChatId),
    ])
    stats = { usersData, historicalData }
  } catch (error) {
    logger.error(
      { chatId: normalizedChatId, err: error },
      'websocket.broadcast.stats_fetch_failed',
    )
    return
  }

  const results = await Promise.allSettled(
    connections.map((connection) =>
      sendStatsToConnection(connection.connectionId, broadcastEndpoint, stats),
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
