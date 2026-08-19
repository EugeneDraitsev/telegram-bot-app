import { SignJWT } from 'jose'
import type { APIGatewayProxyEvent } from 'aws-lambda'

import * as common from '@tg-bot/common'
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

  test('caches the expensive chat directory scan for one minute', async () => {
    const originalOwnerId = process.env.BOT_OWNER_ID
    const originalSessionSecret = process.env.ADMIN_SESSION_SECRET
    process.env.BOT_OWNER_ID = '42'
    process.env.ADMIN_SESSION_SECRET = 'x'.repeat(48)

    const token = await new SignJWT({ name: 'Owner' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('telegram-bot-admin')
      .setAudience('telegram-bot-admin-api')
      .setSubject('42')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET))
    const scanSpy = jest.spyOn(common, 'dynamoScanAll').mockResolvedValue([])
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(10_000)
    const authenticatedEvent = event({
      headers: { authorization: `Bearer ${token}` },
    })

    try {
      expect((await handleAdminApi(authenticatedEvent)).statusCode).toBe(200)
      expect((await handleAdminApi(authenticatedEvent)).statusCode).toBe(200)
      expect(
        scanSpy.mock.calls.filter(
          ([input]) =>
            input.TableName === common.CHAT_USER_STATISTICS_TABLE_NAME,
        ),
      ).toHaveLength(1)

      nowSpy.mockReturnValue(70_001)
      expect((await handleAdminApi(authenticatedEvent)).statusCode).toBe(200)
      expect(
        scanSpy.mock.calls.filter(
          ([input]) =>
            input.TableName === common.CHAT_USER_STATISTICS_TABLE_NAME,
        ),
      ).toHaveLength(2)
    } finally {
      jest.restoreAllMocks()
      if (originalOwnerId === undefined) delete process.env.BOT_OWNER_ID
      else process.env.BOT_OWNER_ID = originalOwnerId
      if (originalSessionSecret === undefined) {
        delete process.env.ADMIN_SESSION_SECRET
      } else {
        process.env.ADMIN_SESSION_SECRET = originalSessionSecret
      }
    }
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
