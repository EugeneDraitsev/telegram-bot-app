import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { FRONTEND_BASE_URL } from '@tg-bot/common'
import { getChatByName } from '..'

const getChatByNameWithEvent = getChatByName as unknown as (
  event: APIGatewayProxyEvent,
) => Promise<APIGatewayProxyResult>

const createEvent = (name?: string, origin?: string, httpMethod = 'GET') =>
  ({
    httpMethod,
    headers: origin ? { origin } : {},
    queryStringParameters: name === undefined ? null : { name },
  }) as APIGatewayProxyEvent

const callHandler = async (name?: string, origin?: string) =>
  getChatByNameWithEvent(createEvent(name, origin))

describe('chat search', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('rejects missing or too short search names', async () => {
    const sendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')

    const response = await callHandler('ab')

    expect(response.statusCode).toBe(400)
    expect(sendSpy).not.toHaveBeenCalled()
  })

  test('searches public chat fields without returning private chats', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() =>
        Promise.resolve({
          Items: [
            { chatInfo: { id: 1, type: 'supergroup', title: 'Best Group' } },
            { chatInfo: { id: 2, type: 'private', first_name: 'Best' } },
            { chatInfo: { id: 3, type: 'group', username: 'another_group' } },
            { chatInfo: { id: 4, title: 'Best Missing Type' } },
          ],
        }),
      )

    const response = await callHandler('best', 'http://localhost:5173')

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([
      { id: 1, type: 'supergroup', title: 'Best Group' },
    ])
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        TableName: 'chat-statistics',
        ProjectionExpression: 'chatInfo',
      }),
    )
    expect(sendSpy.mock.calls[0][0].input).not.toHaveProperty('Limit')
    expect(response.headers).not.toHaveProperty(
      'Access-Control-Allow-Credentials',
    )
    expect(response.headers).toHaveProperty(
      'Access-Control-Allow-Origin',
      'http://localhost:5173',
    )
    expect(response.headers).toHaveProperty('Vary', 'Origin')
  })

  test('continues scanning until chats after the first page are found', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() =>
        Promise.resolve({
          Items: [
            { chatInfo: { id: 1, type: 'group', title: 'Another chat' } },
          ],
          LastEvaluatedKey: { chatId: 'first-page-end' },
        }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          Items: [
            { chatInfo: { id: 2, type: 'supergroup', title: 'Kabold camp' } },
          ],
        }),
      )

    const response = await callHandler('kabold')

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([
      { id: 2, type: 'supergroup', title: 'Kabold camp' },
    ])
    expect(sendSpy).toHaveBeenCalledTimes(2)
    expect(sendSpy.mock.calls[1][0].input).toEqual(
      expect.objectContaining({
        ExclusiveStartKey: { chatId: 'first-page-end' },
      }),
    )
  })

  test('falls back to the first allowed origin for disallowed request origins', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => Promise.resolve({ Items: [] }))

    const response = await callHandler('best', 'https://example.com')

    expect(response.statusCode).toBe(200)
    expect(response.headers).toHaveProperty(
      'Access-Control-Allow-Origin',
      FRONTEND_BASE_URL,
    )
  })

  test('handles CORS preflight in the lambda', async () => {
    const sendSpy = jest.spyOn(DynamoDBDocumentClient.prototype, 'send')

    const response = await getChatByNameWithEvent(
      createEvent(undefined, 'http://localhost:3000', 'OPTIONS'),
    )

    expect(response.statusCode).toBe(204)
    expect(sendSpy).not.toHaveBeenCalled()
    expect(response.headers).toHaveProperty(
      'Access-Control-Allow-Origin',
      'http://localhost:3000',
    )
    expect(response.headers).toHaveProperty(
      'Access-Control-Allow-Methods',
      'GET,OPTIONS',
    )
  })

  test('handles null headers without throwing', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => Promise.resolve({ Items: [] }))

    const response = await getChatByNameWithEvent({
      ...createEvent('best'),
      headers: null as never,
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers).toHaveProperty(
      'Access-Control-Allow-Origin',
      FRONTEND_BASE_URL,
    )
  })
})
