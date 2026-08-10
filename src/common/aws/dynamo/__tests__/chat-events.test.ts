import type { Chat, User } from 'grammy/types'

import * as utils from '../../../utils'
import {
  getChatEventSortKey,
  getChatEventTtl,
  recordChatActivity,
  shouldSkipStatsBroadcast,
} from '../chat-events'

const transactSpy = jest.spyOn(utils, 'dynamoTransactWrite')
const invokeLambdaSpy = jest.spyOn(utils, 'invokeLambda')

describe('shouldSkipStatsBroadcast', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  test('skips websocket broadcast in offline mode by default', () => {
    process.env.IS_OFFLINE = 'true'
    delete process.env.ENABLE_LOCAL_WEBSOCKET_BROADCAST

    expect(shouldSkipStatsBroadcast()).toBe(true)
  })

  test('allows local websocket broadcast when explicitly enabled', () => {
    process.env.IS_OFFLINE = 'true'
    process.env.ENABLE_LOCAL_WEBSOCKET_BROADCAST = 'true'

    expect(shouldSkipStatsBroadcast()).toBe(false)
  })

  test('allows websocket broadcast outside offline mode', () => {
    process.env.IS_OFFLINE = 'false'

    expect(shouldSkipStatsBroadcast()).toBe(false)
  })
})

describe('getChatEventSortKey', () => {
  test('uses the message id to avoid same-second collisions', () => {
    const date = 1_750_000_000
    const first = getChatEventSortKey(date, 10)
    const second = getChatEventSortKey(date, 11)

    expect(first).not.toBe(second)
    expect(first).toBeGreaterThanOrEqual(date * 1000)
    expect(first).toBeLessThan(date * 1000 + 1000)
  })

  test('is deterministic for duplicate delivery of the same message', () => {
    expect(getChatEventSortKey(1_750_000_000, 42)).toBe(
      getChatEventSortKey(1_750_000_000, 42),
    )
  })

  test('preserves millisecond timestamps when no message id is available', () => {
    expect(getChatEventSortKey(1_750_000_000_123)).toBe(1_750_000_000_123)
  })
})

describe('getChatEventTtl', () => {
  test('retains new chat events for three days', () => {
    const dateSeconds = 1_750_000_000

    expect(getChatEventTtl(dateSeconds)).toBe(dateSeconds + 3 * 24 * 60 * 60)
  })
})

describe('recordChatActivity', () => {
  const user = { id: 7, username: 'alice' } as User
  const chat = { id: -100, type: 'group', title: 'Test chat' } as Chat

  beforeEach(() => {
    transactSpy.mockReset().mockResolvedValue({} as never)
    invokeLambdaSpy.mockReset().mockResolvedValue(undefined as never)
    process.env.WEBSOCKET_BROADCAST_FUNCTION_NAME = 'broadcast-fn'
  })

  afterEach(() => {
    delete process.env.WEBSOCKET_BROADCAST_FUNCTION_NAME
  })

  test('counts the message in the same transaction as its event insert', async () => {
    await expect(
      recordChatActivity({
        userInfo: user,
        chat,
        command: '/x',
        date: 1_750_000_000,
        messageId: 42,
      }),
    ).resolves.toEqual({ recorded: true })

    const items = transactSpy.mock.calls[0]?.[0]?.TransactItems ?? []
    expect(items).toHaveLength(2)
    expect(items[0]?.Put).toMatchObject({
      TableName: 'chat-events',
      ConditionExpression: 'attribute_not_exists(chatId)',
      Item: { chatId: '-100', date: getChatEventSortKey(1_750_000_000, 42) },
    })
    expect(items[1]?.Update).toMatchObject({
      TableName: 'chat-user-statistics',
      Key: { chatId: '-100', userId: 7 },
      ExpressionAttributeValues: expect.objectContaining({ ':one': 1 }),
    })
  })

  test('does not count a replayed message and skips the broadcast', async () => {
    transactSpy.mockRejectedValueOnce(
      Object.assign(new Error('cancelled'), {
        name: 'TransactionCanceledException',
        CancellationReasons: [
          { Code: 'ConditionalCheckFailed' },
          { Code: 'None' },
        ],
      }),
    )

    await expect(
      recordChatActivity({ userInfo: user, chat, messageId: 42 }),
    ).resolves.toEqual({ recorded: false })
    expect(invokeLambdaSpy).not.toHaveBeenCalled()
  })

  test('rethrows a transaction cancelled for any other reason', async () => {
    transactSpy.mockRejectedValueOnce(
      Object.assign(new Error('throttled'), {
        name: 'TransactionCanceledException',
        CancellationReasons: [{ Code: 'ThrottlingError' }],
      }),
    )

    await expect(
      recordChatActivity({ userInfo: user, chat, messageId: 42 }),
    ).rejects.toThrow('throttled')
  })

  test('ignores messages without a sender or chat', async () => {
    await expect(recordChatActivity({ chat })).resolves.toEqual({
      recorded: false,
    })
    await expect(recordChatActivity({ userInfo: user })).resolves.toEqual({
      recorded: false,
    })
    expect(transactSpy).not.toHaveBeenCalled()
  })
})
