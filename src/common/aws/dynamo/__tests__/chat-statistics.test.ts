import type { Chat, User } from 'grammy/types'

import * as utils from '../../../utils'
import {
  buildFormattedChatStatisticsMessages,
  getStoredChatStatistics,
  setUserOptOut,
  updateStatistics,
} from '../chat-statistics'

const querySpy = jest.spyOn(utils, 'dynamoQuery')
const queryAllSpy = jest.spyOn(utils, 'dynamoQueryAll')
const putSpy = jest.spyOn(utils, 'dynamoPutItem')
const updateSpy = jest.spyOn(utils, 'dynamoUpdateItem')

beforeEach(() => {
  querySpy.mockReset()
  queryAllSpy.mockReset()
  putSpy.mockReset()
  updateSpy.mockReset()
  queryAllSpy.mockResolvedValue([])
  putSpy.mockResolvedValue({} as never)
  updateSpy.mockResolvedValue({} as never)
})

describe('buildFormattedChatStatisticsMessages', () => {
  test('builds plain fallback text and rich markdown table from the same stats', () => {
    const result = buildFormattedChatStatisticsMessages([
      { id: 1, username: 'alice', msgCount: 10 },
      { id: 2, username: 'bo|b', msgCount: 30 },
    ])

    expect(result.text).toContain('All messages: 40')
    expect(result.text).toContain('30 (75.00%) - bo|b')
    expect(result.text).toContain('10 (25.00%) - alice')

    expect(result.richMarkdown).toContain('# Users Statistic')
    expect(result.richMarkdown).toContain('| User | Messages | Share |')
    expect(result.richMarkdown).toContain('| bo\\|b | 30 | 75.00% |')
    expect(result.richMarkdown).toContain('| alice | 10 | 25.00% |')
    expect(result.richMarkdown).not.toContain('| # |')
  })

  test('caps rich table rows while preserving full fallback text', () => {
    const result = buildFormattedChatStatisticsMessages(
      Array.from({ length: 101 }, (_, index) => ({
        id: index,
        username: `user${index}`,
        msgCount: 101 - index,
      })),
    )

    expect(result.richMarkdown).toContain('Showing top 100 of 101 users.')
    expect(result.richMarkdown).not.toContain('user100')
    expect(result.text).toContain('1 (0.02%) - user100')
  })
})

describe('per-user chat statistics storage', () => {
  const user = { id: 7, username: 'alice' } as User
  const chat = { id: -100, type: 'group', title: 'Test chat' } as Chat

  test('creates one small item for a new user', async () => {
    querySpy.mockResolvedValue({ Items: [] } as never)

    await updateStatistics(user, chat)

    expect(putSpy).toHaveBeenCalledWith({
      TableName: 'chat-user-statistics',
      Item: {
        chatId: '-100',
        userId: 7,
        msgCount: 1,
        username: 'alice',
        optedOut: undefined,
        chatInfo: chat,
        updatedAt: expect.any(Number),
      },
      ConditionExpression:
        'attribute_not_exists(#chatId) AND attribute_not_exists(#userId)',
      ExpressionAttributeNames: {
        '#chatId': 'chatId',
        '#userId': 'userId',
      },
    })
  })

  test('increments an existing user atomically without reading legacy data', async () => {
    querySpy.mockResolvedValue({
      Items: [
        {
          chatId: '-100',
          userId: 7,
          msgCount: 5,
          username: 'alice',
        },
      ],
    } as never)

    await updateStatistics(user, chat)

    expect(querySpy).toHaveBeenCalledTimes(1)
    expect(putSpy).not.toHaveBeenCalled()
    expect(updateSpy).toHaveBeenCalledWith({
      TableName: 'chat-user-statistics',
      Key: { chatId: '-100', userId: 7 },
      UpdateExpression:
        'SET #username = :username, #chatInfo = :chatInfo, #updatedAt = :updatedAt ADD #msgCount :one',
      ConditionExpression:
        'attribute_exists(#chatId) AND attribute_exists(#userId)',
      ExpressionAttributeNames: {
        '#chatId': 'chatId',
        '#userId': 'userId',
        '#username': 'username',
        '#chatInfo': 'chatInfo',
        '#updatedAt': 'updatedAt',
        '#msgCount': 'msgCount',
      },
      ExpressionAttributeValues: {
        ':username': 'alice',
        ':chatInfo': chat,
        ':updatedAt': expect.any(Number),
        ':one': 1,
      },
    })
  })

  test('migrates a legacy count on the first new write', async () => {
    querySpy
      .mockResolvedValueOnce({ Items: [] } as never)
      .mockResolvedValueOnce({
        Items: [
          {
            chatId: '-100',
            chatInfo: chat,
            users: [
              { id: 7, msgCount: 5, username: 'old-name', optedOut: true },
            ],
          },
        ],
      } as never)

    await updateStatistics(user, chat)

    expect(querySpy).toHaveBeenCalledTimes(2)
    expect(putSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          chatId: '-100',
          userId: 7,
          msgCount: 6,
          username: 'alice',
          optedOut: true,
        }),
      }),
    )
  })

  test('falls back to atomic increment after a concurrent first write', async () => {
    querySpy.mockResolvedValue({ Items: [] } as never)
    putSpy.mockRejectedValueOnce(
      Object.assign(new Error('write conflict'), {
        name: 'ConditionalCheckFailedException',
      }),
    )

    await updateStatistics(user, chat)

    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy.mock.calls[0]?.[0]).toMatchObject({
      TableName: 'chat-user-statistics',
      Key: { chatId: '-100', userId: 7 },
      ExpressionAttributeValues: expect.objectContaining({ ':one': 1 }),
    })
  })

  test('updates opt-out state on the per-user item', async () => {
    querySpy.mockResolvedValue({
      Items: [
        {
          chatId: '-100',
          userId: 7,
          msgCount: 5,
          username: 'alice',
        },
      ],
    } as never)

    await expect(setUserOptOut(-100, 7, true)).resolves.toBe('updated')
    expect(updateSpy).toHaveBeenCalledWith({
      TableName: 'chat-user-statistics',
      Key: { chatId: '-100', userId: 7 },
      UpdateExpression: 'SET #optedOut = :optedOut',
      ConditionExpression:
        'attribute_exists(#chatId) AND attribute_exists(#userId)',
      ExpressionAttributeNames: {
        '#chatId': 'chatId',
        '#userId': 'userId',
        '#optedOut': 'optedOut',
      },
      ExpressionAttributeValues: { ':optedOut': true },
    })
  })

  test('migrates a legacy user when changing opt-out state', async () => {
    querySpy
      .mockResolvedValueOnce({ Items: [] } as never)
      .mockResolvedValueOnce({
        Items: [
          {
            chatId: '-100',
            chatInfo: chat,
            users: [{ id: 7, msgCount: 5, username: 'alice' }],
          },
        ],
      } as never)

    await expect(setUserOptOut(-100, 7, true)).resolves.toBe('updated')
    expect(putSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'chat-user-statistics',
        Item: {
          chatId: '-100',
          userId: 7,
          msgCount: 5,
          username: 'alice',
          optedOut: true,
        },
      }),
    )
  })

  test('merges legacy users with new per-user records', async () => {
    querySpy.mockResolvedValue({
      Items: [
        {
          chatId: '-100',
          chatInfo: chat,
          users: [
            { id: 7, msgCount: 5, username: 'old-alice' },
            { id: 8, msgCount: 2, username: 'bob' },
          ],
        },
      ],
    } as never)
    const currentChat = { ...chat, title: 'Renamed chat' } as Chat
    queryAllSpy.mockResolvedValue([
      {
        chatId: '-100',
        userId: 7,
        msgCount: 8,
        username: 'alice',
        chatInfo: currentChat,
        updatedAt: 10,
      },
    ])

    await expect(getStoredChatStatistics(-100)).resolves.toEqual({
      chatId: '-100',
      chatInfo: currentChat,
      users: [
        { id: 7, msgCount: 8, username: 'alice', optedOut: undefined },
        { id: 8, msgCount: 2, username: 'bob' },
      ],
      version: undefined,
    })
  })
})
