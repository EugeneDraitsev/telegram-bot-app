import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda'

import { createStatisticsAccessToken, logger } from '@tg-bot/common'

const connectionsTableName = 'websocket-connections'
const connectionsChatIdIndexName = 'websocket-connections-chat-id'
const originalEnv = { ...process.env }

beforeAll(() => {
  process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME = connectionsTableName
  process.env.WEBSOCKET_CONNECTIONS_CHAT_ID_INDEX_NAME =
    connectionsChatIdIndexName
  process.env.WEBSOCKET_BROADCAST_ENDPOINT = 'example.execute-api.test/prod'
  process.env.STATISTICS_ACCESS_SECRET = 'test-statistics-secret'
})

afterAll(() => {
  process.env = originalEnv
})

const loadHandlers = async () => {
  return require('..') as typeof import('../index.js')
}

const createStatsEvent = (body: unknown) => {
  const bodyWithAccess =
    body && typeof body === 'object' && !Array.isArray(body)
      ? {
          accessToken: createStatisticsAccessToken(
            String((body as { chatId?: unknown }).chatId ?? '123'),
          ),
          ...body,
        }
      : body

  return {
    body: JSON.stringify(bodyWithAccess),
    requestContext: {
      connectionId: 'connection-1',
      domainName: 'example.execute-api.test',
      stage: 'prod',
    },
  } as APIGatewayProxyWebsocketEventV2
}

const createConnectEvent = () =>
  ({
    requestContext: {
      connectionId: 'connection-1',
    },
  }) as APIGatewayProxyWebsocketEventV2

describe('websocket handlers', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('connect updates connection metadata without clearing chat subscription fields', async () => {
    const { connect } = await loadHandlers()
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => Promise.resolve({}))

    const response = await connect(createConnectEvent())

    expect(response.statusCode).toBe(200)
    expect(dynamoSendSpy).toHaveBeenCalledTimes(1)
    expect(dynamoSendSpy.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        TableName: connectionsTableName,
        Key: { connectionId: 'connection-1' },
        UpdateExpression: 'SET #date = :date, #ttl = :ttl',
        ExpressionAttributeNames: { '#date': 'date', '#ttl': 'ttl' },
      }),
    )
    expect(dynamoSendSpy.mock.calls[0][0].input).not.toHaveProperty('Item')
  })

  test('connect succeeds when its update committed before the timeout', async () => {
    const { connect } = await loadHandlers()
    const writeError = new Error('timed out')
    let savedDate: number | undefined
    let savedTtl: number | undefined
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation((command) => {
        const input = command.input as Record<string, unknown>

        if (input.UpdateExpression) {
          const values = input.ExpressionAttributeValues as Record<
            string,
            number
          >
          savedDate = values[':date']
          savedTtl = values[':ttl']
          return Promise.reject(writeError)
        }

        if (input.ConsistentRead === true) {
          return Promise.resolve({
            Item: {
              connectionId: 'connection-1',
              date: savedDate,
              ttl: savedTtl,
            },
          })
        }

        return Promise.reject(new Error('unexpected DynamoDB command'))
      })

    const response = await connect(createConnectEvent())

    expect(response.statusCode).toBe(200)
    expect(dynamoSendSpy).toHaveBeenCalledTimes(2)
    expect(dynamoSendSpy.mock.calls[1][0].input).toEqual(
      expect.objectContaining({
        TableName: connectionsTableName,
        Key: { connectionId: 'connection-1' },
        ConsistentRead: true,
      }),
    )
  })

  test('connect preserves the write error when reconciliation does not match', async () => {
    const { connect } = await loadHandlers()
    const writeError = new Error('timed out')
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() => Promise.reject(writeError))
      .mockImplementationOnce(() =>
        Promise.resolve({
          Item: { connectionId: 'connection-1', date: 0, ttl: 0 },
        }),
      )

    await expect(connect(createConnectEvent())).rejects.toBe(writeError)
    expect(dynamoSendSpy).toHaveBeenCalledTimes(2)
  })

  test('stats sends its snapshot when the subscription committed before the timeout', async () => {
    const { stats } = await loadHandlers()
    const writeError = new Error('timed out')
    let savedChatId: string | undefined
    let savedTtl: number | undefined
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation((command) => {
        const input = command.input as Record<string, unknown>

        if (
          input.TableName === connectionsTableName &&
          input.UpdateExpression
        ) {
          const values = input.ExpressionAttributeValues as Record<
            string,
            string | number
          >
          savedChatId = String(values[':chatId'])
          savedTtl = Number(values[':ttl'])
          return Promise.reject(writeError)
        }

        if (
          input.TableName === connectionsTableName &&
          input.ConsistentRead === true
        ) {
          return Promise.resolve({
            Item: {
              connectionId: 'connection-1',
              chatId: savedChatId,
              ttl: savedTtl,
            },
          })
        }

        if (input.Select === 'COUNT') {
          return Promise.resolve({ Count: 0 })
        }

        if (
          input.TableName === 'chat-events' ||
          input.TableName === 'chat-user-statistics'
        ) {
          return Promise.resolve({ Items: [] })
        }

        return Promise.reject(new Error('unexpected DynamoDB command'))
      })
    const apiSendSpy = jest
      .spyOn(ApiGatewayManagementApiClient.prototype, 'send')
      .mockImplementation(() => Promise.resolve({}) as never)

    const response = await stats(createStatsEvent({ chatId: '789' }))

    expect(response.statusCode).toBe(200)
    expect(apiSendSpy).toHaveBeenCalledTimes(1)
    expect(
      dynamoSendSpy.mock.calls.some(
        ([command]) =>
          (command.input as { ConsistentRead?: boolean }).ConsistentRead ===
          true,
      ),
    ).toBe(true)
  })

  test('stats preserves the write error when subscription reconciliation does not match', async () => {
    const { stats } = await loadHandlers()
    const writeError = new Error('timed out')
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() => Promise.reject(writeError))
      .mockImplementationOnce(() =>
        Promise.resolve({
          Item: {
            connectionId: 'connection-1',
            chatId: '456',
            ttl: 0,
          },
        }),
      )
    const apiSendSpy = jest.spyOn(
      ApiGatewayManagementApiClient.prototype,
      'send',
    )

    await expect(stats(createStatsEvent({ chatId: '123' }))).rejects.toBe(
      writeError,
    )
    expect(dynamoSendSpy).toHaveBeenCalledTimes(2)
    expect(apiSendSpy).not.toHaveBeenCalled()
  })

  test('stats still sends a snapshot when subscription write finds no connection row', async () => {
    const { stats } = await loadHandlers()
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation((command) => {
        const input = command.input as Record<string, unknown>

        if (input.TableName === connectionsTableName) {
          return Promise.reject(
            Object.assign(new Error('missing connection'), {
              name: 'ConditionalCheckFailedException',
            }),
          )
        }

        if (input.TableName === 'chat-events') {
          return Promise.resolve({
            Items: [
              {
                chatId: '123',
                date: Date.now(),
                userInfo: { id: 1, first_name: 'Jane' },
              },
            ],
          })
        }

        if (input.TableName === 'chat-user-statistics') {
          return Promise.resolve({
            Items: [
              {
                chatId: '123',
                userId: 1,
                msgCount: 2,
                username: 'Jane',
                chatInfo: {
                  id: 123,
                  type: 'group',
                  title: 'Test chat',
                  invite_link: 'https://example.test/private-invite',
                },
                updatedAt: 1,
              },
            ],
          })
        }

        return Promise.reject(new Error(`unexpected table ${input.TableName}`))
      })
    const apiSendSpy = jest
      .spyOn(ApiGatewayManagementApiClient.prototype, 'send')
      .mockImplementation(() => Promise.resolve({}) as never)

    const response = await stats(createStatsEvent({ chatId: '123' }))

    expect(response.statusCode).toBe(200)
    const statisticsReads = dynamoSendSpy.mock.calls.filter(
      ([command]) => (command.input as { Select?: string }).Select !== 'COUNT',
    )
    expect(statisticsReads).toHaveLength(3)
    expect(apiSendSpy).toHaveBeenCalledTimes(1)
    const postInput = apiSendSpy.mock.calls[0][0].input as { Data: unknown }

    const payload = JSON.parse(String(postInput.Data))
    expect(payload).toMatchObject({
      chatInfo: { id: 123, type: 'group', title: 'Test chat' },
      usersData: [{ id: 1, first_name: 'Jane', messages: 1 }],
      historicalData: [{ id: 1, msgCount: 2, username: 'Jane' }],
    })
    expect(Object.keys(payload.messageCounts)).toEqual([
      'day',
      'week',
      'month',
      'year',
    ])
    expect(payload.messageCounts.day).toHaveLength(24)
    expect(payload.messageCounts.week).toHaveLength(7)
    expect(payload.messageCounts.month).toHaveLength(30)
    expect(payload.messageCounts.year).toHaveLength(12)
  })

  // A chat of its own: the counts cache is module state shared across tests,
  // and a hit would hide the failure this asserts.
  test('stats still sends the snapshot when the counts queries fail', async () => {
    const { stats } = await loadHandlers()
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation((command) => {
        const input = command.input as Record<string, unknown>

        if (input.Select === 'COUNT') {
          return Promise.reject(new Error('throttled'))
        }

        if (input.TableName === connectionsTableName) {
          return Promise.resolve({})
        }

        if (input.TableName === 'chat-events') {
          return Promise.resolve({
            Items: [
              {
                chatId: '456',
                date: Date.now(),
                userInfo: { id: 1, first_name: 'Jane' },
              },
            ],
          })
        }

        return Promise.resolve({ Items: [] })
      })
    const apiSendSpy = jest
      .spyOn(ApiGatewayManagementApiClient.prototype, 'send')
      .mockImplementation(() => Promise.resolve({}) as never)

    const response = await stats(createStatsEvent({ chatId: '456' }))

    expect(response.statusCode).toBe(200)
    // The chart is the widest failure surface in the snapshot; losing it must
    // not cost the viewer the parts that did load.
    expect(apiSendSpy).toHaveBeenCalledTimes(1)
    const postInput = apiSendSpy.mock.calls[0][0].input as { Data: unknown }
    const payload = JSON.parse(String(postInput.Data))

    expect(payload.messageCounts).toBeUndefined()
    expect(payload.usersData).toEqual([
      { id: 1, first_name: 'Jane', messages: 1 },
    ])
  })

  test('broadcast removes gone connections rejected by API Gateway', async () => {
    const { broadcastStats } = await loadHandlers()
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation((command) => {
        const input = command.input as Record<string, unknown>

        if (input.IndexName === connectionsChatIdIndexName) {
          return Promise.resolve({
            Items: [{ connectionId: 'connection-1', chatId: '123' }],
          })
        }

        if (input.TableName === 'chat-events') {
          return Promise.resolve({ Items: [] })
        }

        if (input.TableName === 'chat-user-statistics') {
          return Promise.resolve({ Items: [] })
        }

        if (
          input.TableName === connectionsTableName &&
          JSON.stringify(input.Key) === '{"connectionId":"connection-1"}'
        ) {
          return Promise.resolve({})
        }

        return Promise.reject(new Error(`unexpected input ${input.TableName}`))
      })
    jest
      .spyOn(ApiGatewayManagementApiClient.prototype, 'send')
      .mockImplementation(
        () =>
          Promise.reject(
            Object.assign(new Error('gone'), {
              name: 'GoneException',
            }),
          ) as never,
      )

    await broadcastStats({ chatId: '123' })

    expect(
      dynamoSendSpy.mock.calls.some(
        ([command]) =>
          JSON.stringify((command.input as { Key?: unknown }).Key) ===
          '{"connectionId":"connection-1"}',
      ),
    ).toBe(true)
  })

  test('broadcast does not remove connections on forbidden API errors', async () => {
    const { broadcastStats } = await loadHandlers()
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation((command) => {
        const input = command.input as Record<string, unknown>

        if (input.IndexName === connectionsChatIdIndexName) {
          return Promise.resolve({
            Items: [{ connectionId: 'connection-1', chatId: '123' }],
          })
        }

        if (input.TableName === 'chat-events') {
          return Promise.resolve({ Items: [] })
        }

        if (input.TableName === 'chat-user-statistics') {
          return Promise.resolve({ Items: [] })
        }

        return Promise.reject(new Error(`unexpected input ${input.TableName}`))
      })
    jest
      .spyOn(ApiGatewayManagementApiClient.prototype, 'send')
      .mockImplementation(
        () =>
          Promise.reject(
            Object.assign(new Error('forbidden'), {
              name: 'ForbiddenException',
            }),
          ) as never,
      )

    await broadcastStats({ chatId: '123' })

    expect(
      dynamoSendSpy.mock.calls.some(
        ([command]) =>
          (command.input as { TableName?: unknown }).TableName ===
            connectionsTableName &&
          Boolean((command.input as { Key?: unknown }).Key),
      ),
    ).toBe(false)
  })

  test('broadcast logs and skips invalid chat ids before reading connections', async () => {
    const { broadcastStats } = await loadHandlers()
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {})
    const dynamoSendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')

    await broadcastStats({ chatId: '0' })

    expect(warnSpy).toHaveBeenCalledWith(
      { chatId: '0' },
      'websocket.broadcast.invalid_chat_id',
    )
    expect(dynamoSendSpy).not.toHaveBeenCalled()
  })

  test.each([{ chatId: '0' }, { chatId: 0 }])(
    'stats rejects zero chat ids before reading or sending stats',
    async (body) => {
      const { stats } = await loadHandlers()
      const dynamoSendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
      const apiSendSpy = jest.spyOn(
        ApiGatewayManagementApiClient.prototype,
        'send',
      )

      const response = await stats(createStatsEvent(body))

      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.body)).toEqual({ message: 'invalid chat id' })
      expect(dynamoSendSpy).not.toHaveBeenCalled()
      expect(apiSendSpy).not.toHaveBeenCalled()
    },
  )

  test('stats treats null chat id as missing before reading or sending stats', async () => {
    const { stats } = await loadHandlers()
    const dynamoSendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    const apiSendSpy = jest.spyOn(
      ApiGatewayManagementApiClient.prototype,
      'send',
    )

    const response = await stats(createStatsEvent({ chatId: null }))

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ message: 'missing chat id' })
    expect(dynamoSendSpy).not.toHaveBeenCalled()
    expect(apiSendSpy).not.toHaveBeenCalled()
  })

  test('stats rejects invalid access tokens before reading chat data', async () => {
    const { stats } = await loadHandlers()
    const dynamoSendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    const apiSendSpy = jest
      .spyOn(ApiGatewayManagementApiClient.prototype, 'send')
      .mockImplementation(() => Promise.resolve({}) as never)

    const response = await stats(
      createStatsEvent({ chatId: '123', accessToken: 'invalid' }),
    )

    expect(response.statusCode).toBe(401)
    expect(dynamoSendSpy).not.toHaveBeenCalled()
    expect(apiSendSpy).toHaveBeenCalledTimes(1)
    const postInput = apiSendSpy.mock.calls[0][0].input as { Data: unknown }
    expect(JSON.parse(String(postInput.Data))).toEqual({
      error: expect.stringContaining('invalid or expired'),
    })
  })

  test('stats keeps subscription when initial snapshot fetch fails', async () => {
    const { stats } = await loadHandlers()
    const dynamoSendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation((command) => {
        const input = command.input as Record<string, unknown>

        if (input.TableName === connectionsTableName) {
          return Promise.resolve({})
        }

        if (input.TableName === 'chat-events') {
          return Promise.reject(new Error('chat events unavailable'))
        }

        if (input.TableName === 'chat-user-statistics') {
          return Promise.resolve({ Items: [] })
        }

        return Promise.reject(new Error(`unexpected table ${input.TableName}`))
      })
    const apiSendSpy = jest.spyOn(
      ApiGatewayManagementApiClient.prototype,
      'send',
    )

    const response = await stats(createStatsEvent({ chatId: '123' }))

    expect(response.statusCode).toBe(200)
    expect(dynamoSendSpy).toHaveBeenCalledTimes(3)
    expect(apiSendSpy).not.toHaveBeenCalled()
  })

  test('stats rejects malformed json before reading or sending stats', async () => {
    const { stats } = await loadHandlers()
    const dynamoSendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
    const apiSendSpy = jest.spyOn(
      ApiGatewayManagementApiClient.prototype,
      'send',
    )

    const response = await stats({ ...createStatsEvent({}), body: '{' })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ message: 'invalid json' })
    expect(dynamoSendSpy).not.toHaveBeenCalled()
    expect(apiSendSpy).not.toHaveBeenCalled()
  })

  test.each(['null', 'true', '123', '[]'])(
    'stats rejects non-object json bodies before reading or sending stats',
    async (body) => {
      const { stats } = await loadHandlers()
      const dynamoSendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')
      const apiSendSpy = jest.spyOn(
        ApiGatewayManagementApiClient.prototype,
        'send',
      )

      const response = await stats({ ...createStatsEvent({}), body })

      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.body)).toEqual({
        message: 'invalid stats body',
      })
      expect(dynamoSendSpy).not.toHaveBeenCalled()
      expect(apiSendSpy).not.toHaveBeenCalled()
    },
  )
})
