import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'

import { getChatByName } from '..'

const getChatByNameWithEvent = getChatByName as unknown as (
  event: APIGatewayProxyEvent,
) => Promise<APIGatewayProxyResult>

const createEvent = (name?: string) =>
  ({
    queryStringParameters: name === undefined ? null : { name },
  }) as APIGatewayProxyEvent

const callHandler = async (name?: string) =>
  getChatByNameWithEvent(createEvent(name))

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
          ],
        }),
      )

    const response = await callHandler('best')

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual([
      { id: 1, type: 'supergroup', title: 'Best Group' },
    ])
    expect(sendSpy).toHaveBeenCalledTimes(1)
    expect(sendSpy.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        TableName: 'chat-statistics',
        ProjectionExpression: 'chatInfo',
        Limit: 100,
      }),
    )
    expect(response.headers).not.toHaveProperty(
      'Access-Control-Allow-Credentials',
    )
  })
})
