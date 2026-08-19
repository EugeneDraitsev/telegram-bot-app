import type { APIGatewayProxyEvent } from 'aws-lambda'

import { handleAdminApi, mergeAdminChats } from '../index'

const event = (overrides: Partial<APIGatewayProxyEvent> = {}) =>
  ({
    body: null,
    headers: {},
    httpMethod: 'GET',
    path: '/admin/chats',
    pathParameters: null,
    queryStringParameters: null,
    resource: '/admin/chats',
    ...overrides,
  }) as APIGatewayProxyEvent

describe('admin API chat directory', () => {
  test('merges configuration with the newest stored chat metadata', () => {
    const chats = mergeAdminChats(
      [
        {
          chatId: '-1001',
          aiAllowed: true,
          agenticEnabled: false,
          version: 3,
          allowUpdatedAt: 100,
        },
      ],
      [
        {
          chatId: '-1001',
          chatInfo: { title: 'Old title', type: 'supergroup' },
          updatedAt: 1000,
        },
        {
          chatId: '-1001',
          chatInfo: {
            title: 'Current title',
            type: 'supergroup',
            username: 'current_chat',
          },
          updatedAt: 2000,
        },
        {
          chatId: '-1002',
          chatInfo: { title: 'Unconfigured chat', type: 'group' },
          updatedAt: 1500,
        },
      ],
    )

    expect(chats).toEqual([
      expect.objectContaining({
        chatId: '-1001',
        name: 'Current title',
        username: 'current_chat',
        aiAllowed: true,
        agenticEnabled: false,
        configured: true,
        lastActivityAt: 2000,
      }),
      expect.objectContaining({
        chatId: '-1002',
        name: 'Unconfigured chat',
        aiAllowed: false,
        agenticEnabled: false,
        configured: false,
      }),
    ])
  })

  test('rejects list requests without an admin session', async () => {
    const response = await handleAdminApi(event())
    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({
      error: 'Admin session is missing',
    })
  })

  test('validates session exchange payloads before Telegram verification', async () => {
    const response = await handleAdminApi(
      event({
        httpMethod: 'POST',
        path: '/admin/session',
        resource: '/admin/session',
        body: '{}',
      }),
    )
    expect(response.statusCode).toBe(400)
  })
})
