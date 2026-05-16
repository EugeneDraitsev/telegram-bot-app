import { ApiGatewayManagementApiClient } from '@aws-sdk/client-apigatewaymanagementapi'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyWebsocketEventV2 } from 'aws-lambda'

const connectionsTableName = 'websocket-connections'
const connectionsChatIdIndexName = 'websocket-connections-chat-id'
const originalEnv = process.env

beforeAll(() => {
  process.env.WEBSOCKET_CONNECTIONS_TABLE_NAME = connectionsTableName
  process.env.WEBSOCKET_CONNECTIONS_CHAT_ID_INDEX_NAME =
    connectionsChatIdIndexName
  process.env.WEBSOCKET_BROADCAST_ENDPOINT = 'example.execute-api.test/prod'
})

afterAll(() => {
  process.env = originalEnv
})

const loadHandlers = async () => {
  return require('..') as typeof import('../index.js')
}

const createStatsEvent = (body: unknown) =>
  ({
    body: JSON.stringify(body),
    requestContext: {
      connectionId: 'connection-1',
      domainName: 'example.execute-api.test',
      stage: 'prod',
    },
  }) as APIGatewayProxyWebsocketEventV2

describe('websocket handlers', () => {
  afterEach(() => {
    jest.restoreAllMocks()
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

        if (input.TableName === 'chat-statistics') {
          return Promise.resolve({
            Items: [
              {
                chatId: '123',
                users: [{ id: 1, msgCount: 2, username: 'Jane' }],
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
    expect(dynamoSendSpy).toHaveBeenCalledTimes(3)
    expect(apiSendSpy).toHaveBeenCalledTimes(1)
    const postInput = apiSendSpy.mock.calls[0][0].input as { Data: unknown }

    expect(JSON.parse(String(postInput.Data))).toEqual({
      usersData: [{ id: 1, first_name: 'Jane', messages: 1 }],
      historicalData: [{ id: 1, msgCount: 2, username: 'Jane' }],
    })
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

        if (input.TableName === 'chat-statistics') {
          return Promise.resolve({
            Items: [{ chatId: '123', users: [] }],
          })
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

        if (input.TableName === 'chat-statistics') {
          return Promise.resolve({
            Items: [{ chatId: '123', users: [] }],
          })
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

  test.each([
    { chatId: '0' },
    { chatId: 0 },
  ])('stats rejects zero chat ids before reading or sending stats', async (body) => {
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
  })

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

  test.each([
    'null',
    'true',
    '123',
    '[]',
  ])('stats rejects non-object json bodies before reading or sending stats', async (body) => {
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
  })
})
