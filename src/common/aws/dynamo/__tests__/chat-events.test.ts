import type { Chat, User } from 'grammy/types'

import * as utils from '../../../utils'
import {
  getChatEventSortKey,
  getChatMessageCounts,
  getMessageCountBuckets,
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

describe('getMessageCountBuckets', () => {
  // 2026-08-20T13:37:00Z
  const now = Date.UTC(2026, 7, 20, 13, 37)
  const iso = (ms: number) => new Date(ms).toISOString()

  test('covers the last 24 hours in whole hours', () => {
    const buckets = getMessageCountBuckets('day', now)

    expect(buckets).toHaveLength(24)
    expect(iso(buckets[0].from)).toBe('2026-08-19T14:00:00.000Z')
    expect(iso(buckets[23].from)).toBe('2026-08-20T13:00:00.000Z')
    expect(buckets[23].to - buckets[23].from).toBe(60 * 60 * 1000)
  })

  test.each([
    ['week', 7],
    ['month', 30],
  ] as const)('covers %s in local calendar days', (range, length) => {
    const buckets = getMessageCountBuckets(range, now)

    expect(buckets).toHaveLength(length)
    // Local midnight in Stockholm, i.e. 22:00Z the evening before in summer,
    // rather than 00:00Z which would drag two hours of today into yesterday.
    expect(iso(buckets[length - 1].from)).toBe('2026-08-19T22:00:00.000Z')
    expect(buckets[0].to).toBe(buckets[1].from)
  })

  test.each([
    ['spring forward', Date.UTC(2026, 2, 30, 12), 23],
    ['autumn back', Date.UTC(2026, 9, 26, 12), 25],
  ])('keeps a %s day its real length', (_label, at, hours) => {
    const buckets = getMessageCountBuckets('week', at)
    const transition = buckets[buckets.length - 2]

    expect((transition.to - transition.from) / (60 * 60 * 1000)).toBe(hours)
  })

  test('cuts months on local midnight too', () => {
    const buckets = getMessageCountBuckets('year', now)

    // Winter months start at 23:00Z, summer months at 22:00Z.
    expect(iso(buckets[4].from)).toBe('2025-12-31T23:00:00.000Z')
    expect(iso(buckets[11].from)).toBe('2026-07-31T22:00:00.000Z')
  })

  test('covers a year in calendar months, including the year boundary', () => {
    const buckets = getMessageCountBuckets('year', now)

    expect(buckets).toHaveLength(12)
    expect(iso(buckets[0].from)).toBe('2025-08-31T22:00:00.000Z')
    expect(iso(buckets[11].from)).toBe('2026-07-31T22:00:00.000Z')
    // February keeps its own length rather than a fixed 30 days.
    const february = buckets.find((b) => iso(b.from).startsWith('2026-01-31'))
    expect(february).toBeDefined()
    expect(
      ((february?.to ?? 0) - (february?.from ?? 0)) / (24 * 60 * 60 * 1000),
    ).toBe(28)
  })

  test('leaves no gaps or overlaps between buckets', () => {
    for (const range of ['day', 'week', 'month', 'year'] as const) {
      const buckets = getMessageCountBuckets(range, now)
      for (let i = 1; i < buckets.length; i += 1) {
        expect(buckets[i].from).toBe(buckets[i - 1].to)
      }
    }
  })
})

describe('getChatMessageCounts', () => {
  const now = Date.UTC(2026, 7, 20, 13, 37)

  test('counts inside DynamoDB, one bounded query per bucket', async () => {
    const countSpy = jest
      .spyOn(utils, 'dynamoCountAll')
      .mockResolvedValue(4 as never)

    const points = await getChatMessageCounts(-100, 'week', now)

    expect(points).toHaveLength(7)
    expect(points.every((point) => point.count === 4)).toBe(true)
    expect(countSpy).toHaveBeenCalledTimes(7)

    const [input] = countSpy.mock.calls[0]
    expect(input.KeyConditionExpression).toBe(
      'chatId = :chatId AND #date BETWEEN :from AND :to',
    )
    expect(input.ExpressionAttributeValues?.[':chatId']).toBe('-100')
    // Upper bound stops just below the next bucket so a sort key carrying the
    // message-id fraction is never counted twice.
    const buckets = getMessageCountBuckets('week', now)
    expect(input.ExpressionAttributeValues?.[':from']).toBe(buckets[0].from)
    expect(input.ExpressionAttributeValues?.[':to']).toBe(buckets[0].to - 0.001)

    countSpy.mockRestore()
  })
})
