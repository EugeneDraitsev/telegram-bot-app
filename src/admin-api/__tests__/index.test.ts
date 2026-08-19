import { SignJWT } from 'jose'
import type { APIGatewayProxyEvent } from 'aws-lambda'

import * as common from '@tg-bot/common'
import {
  handleAdminApi,
  mergeAdminChats,
  paginateAdminChats,
  parseAdminChatListOptions,
} from '../index'

const originalEnv = { ...process.env }

const signSession = (subject: string, name = 'User') =>
  new SignJWT({ name })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('telegram-bot-admin')
    .setAudience('telegram-bot-admin-api')
    .setSubject(subject)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(process.env.ADMIN_SESSION_SECRET))

beforeEach(() => {
  process.env.BOT_OWNER_ID = '42'
  process.env.ADMIN_SESSION_SECRET = 'x'.repeat(48)
  process.env.STATISTICS_ACCESS_SECRET = 'statistics-secret'
})

afterAll(() => {
  process.env = originalEnv
})

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
      error: 'Telegram session is missing',
    })
  })

  test('filters, sorts, and paginates the admin directory', () => {
    const chats = [
      {
        chatId: '-1',
        name: 'Zulu team',
        aiAllowed: true,
        agenticEnabled: false,
        configured: true,
        version: 1,
        lastActivityAt: 20,
      },
      {
        chatId: '-2',
        name: 'Alpha team',
        aiAllowed: true,
        agenticEnabled: true,
        configured: true,
        version: 2,
        lastActivityAt: 10,
      },
      {
        chatId: '-3',
        name: 'Other',
        aiAllowed: false,
        agenticEnabled: false,
        configured: false,
        version: 0,
        lastActivityAt: 30,
      },
    ]

    expect(
      paginateAdminChats(chats, {
        page: 2,
        pageSize: 1,
        q: 'team',
        aiAccess: 'allowed',
        sort: 'name',
        direction: 'asc',
      }),
    ).toEqual({
      chats: [chats[0]],
      pagination: { page: 2, pageSize: 1, total: 2, totalPages: 2 },
      summary: { total: 3, allowed: 2, enabled: 1 },
      query: {
        page: 2,
        pageSize: 1,
        q: 'team',
        aiAccess: 'allowed',
        sort: 'name',
        direction: 'asc',
      },
    })
  })

  test('normalizes supported page sizes and @username searches', () => {
    expect(parseAdminChatListOptions({ pageSize: '15' }).pageSize).toBe(20)
    expect(parseAdminChatListOptions({ pageSize: '100' }).pageSize).toBe(100)

    const page = paginateAdminChats(
      [
        {
          chatId: '-1',
          name: 'Alpha',
          username: 'alpha_chat',
          aiAllowed: false,
          agenticEnabled: false,
          configured: false,
          version: 0,
        },
      ],
      {
        page: 1,
        pageSize: 20,
        q: '@alpha_chat',
        aiAccess: 'all',
        sort: 'name',
        direction: 'asc',
      },
    )
    expect(page.chats).toHaveLength(1)
  })

  test('lets a signed-in user list only their observed chats', async () => {
    const token = await signSession('7', 'Alice')
    const chatsSpy = jest
      .spyOn(common, 'getStoredUserChats')
      .mockResolvedValue([
        {
          chatId: '-1001',
          chatInfo: { id: -1001, type: 'group', title: 'Shared chat' },
          lastActivityAt: 123,
          messageCount: 8,
        },
      ])

    try {
      const response = await handleAdminApi(
        event({
          path: '/chats',
          resource: '/chats',
          headers: { authorization: `Bearer ${token}` },
        }),
      )

      expect(response.statusCode).toBe(200)
      expect(chatsSpy).toHaveBeenCalledWith(7)
      expect(JSON.parse(response.body)).toEqual({
        user: expect.objectContaining({
          id: '7',
          name: 'Alice',
          isAdmin: false,
        }),
        chats: [
          {
            chatId: '-1001',
            name: 'Shared chat',
            type: 'group',
            lastActivityAt: 123,
            messageCount: 8,
          },
        ],
      })
    } finally {
      jest.restoreAllMocks()
    }
  })

  test('keeps the admin directory owner-only', async () => {
    const token = await signSession('7')
    const response = await handleAdminApi(
      event({ headers: { authorization: `Bearer ${token}` } }),
    )

    expect(response.statusCode).toBe(403)
  })

  test('protects every route under the admin prefix before dispatch', async () => {
    const token = await signSession('7')
    const response = await handleAdminApi(
      event({
        path: '/admin/future-route',
        resource: '/admin/future-route',
        headers: { authorization: `Bearer ${token}` },
      }),
    )

    expect(response.statusCode).toBe(403)
  })

  test('issues a short-lived token only for a stored user-chat pair', async () => {
    const token = await signSession('7')
    const accessSpy = jest
      .spyOn(common, 'hasStoredChatUser')
      .mockResolvedValue(true)

    try {
      const response = await handleAdminApi(
        event({
          path: '/chats/-1001/access',
          resource: '/chats/{chatId}/access',
          pathParameters: { chatId: '-1001' },
          headers: { authorization: `Bearer ${token}` },
        }),
      )
      const body = JSON.parse(response.body)

      expect(response.statusCode).toBe(200)
      expect(accessSpy).toHaveBeenCalledWith('-1001', 7)
      expect(body.expiresIn).toBe(900)
      expect(
        common.verifyStatisticsAccessToken('-1001', body.accessToken),
      ).toBe(true)
    } finally {
      jest.restoreAllMocks()
    }
  })

  test('caches the expensive chat directory scan for one minute', async () => {
    const token = await signSession('42', 'Owner')
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
    }
  })

  test('validates session exchange payloads before Telegram verification', async () => {
    const response = await handleAdminApi(
      event({
        httpMethod: 'POST',
        path: '/session',
        resource: '/session',
        body: '{}',
      }),
    )
    expect(response.statusCode).toBe(400)
  })
})
