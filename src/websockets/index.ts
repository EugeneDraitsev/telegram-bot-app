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
import type { Connection, ConnectionIndexRecord, StatsPayload } from './types'

type StatsBodyParseResult =
  | { kind: 'ok'; value: { chatId?: unknown } }
  | { kind: 'invalid_json' }
  | { kind: 'invalid_body' }

const connectionsTableName = getRequiredEnv('WEBSOCKET_CONNECTIONS_TABLE_NAME')
const connectionsChatIdIndexName = getRequiredEnv(
  'WEBSOCKET_CONNECTIONS_CHAT_ID_INDEX_NAME',
)
const connectionTtlSeconds = 60 * 60 * 3
const clients = new Map<string, ApiGatewayManagementApiClient>()

const ok = (): APIGatewayProxyResult => ({ statusCode: 200, body: '' })

const badRequest = (message: string): APIGatewayProxyResult => ({
  statusCode: 400,
  body: JSON.stringify({ message }),
})

const getExpiresAt = () => Math.floor(Date.now() / 1000) + connectionTtlSeconds

const normalizeChatId = (chatId: unknown) => {
  if (typeof chatId !== 'string' && typeof chatId !== 'number') {
    return undefined
  }

  const chatIdText = String(chatId).trim()

  return /^-?[1-9]\d*$/.test(chatIdText) ? chatIdText : undefined
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

const parseStatsBody = (
  body: string | null | undefined,
): StatsBodyParseResult => {
  try {
    const parsed = JSON.parse(body || '{}') as unknown

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { kind: 'invalid_body' }
    }

    return { kind: 'ok', value: parsed as { chatId?: unknown } }
  } catch {
    return { kind: 'invalid_json' }
  }
}

const isStaleConnectionError = (error: unknown) => {
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
  }).then((result) => (result.Items ?? []) as ConnectionIndexRecord[])

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

const getStatsPayload = async (chatId: string): Promise<StatsPayload> => {
  const [usersData, historicalData] = await Promise.all([
    get24hChatStats(chatId),
    getStoredChatUsers(chatId),
  ])

  return { usersData, historicalData }
}

const sendStatsToConnection = async (
  connectionId: string,
  endpoint: string,
  data: StatsPayload,
) => {
  try {
    await sendEvent(connectionId, endpoint, data)
  } catch (error) {
    if (isStaleConnectionError(error)) {
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

  const statsBodyResult = parseStatsBody(event.body)
  if (statsBodyResult.kind === 'invalid_json') {
    return badRequest('invalid json')
  }

  if (statsBodyResult.kind === 'invalid_body') {
    return badRequest('invalid stats body')
  }

  const { chatId } = statsBodyResult.value
  if (chatId === undefined || chatId === null) {
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
    } else {
      throw error
    }
  }

  let statsPayload: StatsPayload

  try {
    statsPayload = await getStatsPayload(normalizedChatId)
  } catch (error) {
    logger.error(
      { chatId: normalizedChatId, err: error },
      'websocket.stats.stats_fetch_failed',
    )
    return ok()
  }

  await sendStatsToConnection(
    connectionId,
    `${domainName}/${stage}`,
    statsPayload,
  )

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
    logger.warn({ chatId }, 'websocket.broadcast.invalid_chat_id')
    return
  }

  const connections = await getConnections(normalizedChatId)
  if (connections.length === 0) {
    return
  }

  let statsPayload: StatsPayload

  try {
    statsPayload = await getStatsPayload(normalizedChatId)
  } catch (error) {
    logger.error(
      { chatId: normalizedChatId, err: error },
      'websocket.broadcast.stats_fetch_failed',
    )
    return
  }

  const results = await Promise.allSettled(
    connections.map((connection) =>
      sendStatsToConnection(
        connection.connectionId,
        broadcastEndpoint,
        statsPayload,
      ),
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
