import type { Chat, User } from 'grammy/types'

import * as utils from '../../../utils'
import {
  buildFormattedChatStatisticsMessages,
  setUserOptOut,
  updateStatistics,
} from '../chat-statistics'

const querySpy = jest.spyOn(utils, 'dynamoQuery')
const putSpy = jest.spyOn(utils, 'dynamoPutItem')

beforeEach(() => {
  querySpy.mockReset()
  putSpy.mockReset()
  putSpy.mockResolvedValue({} as never)
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

describe('concurrency-safe chat statistics writes', () => {
  const user = { id: 7, username: 'alice' } as User
  const chat = { id: -100, type: 'group', title: 'Test chat' } as Chat

  test('creates a new statistics item only when the chat is absent', async () => {
    querySpy.mockResolvedValue({ Items: [] } as never)

    await updateStatistics(user, chat)

    expect(putSpy).toHaveBeenCalledWith({
      TableName: 'chat-statistics',
      Item: {
        chatId: '-100',
        chatInfo: chat,
        users: [{ id: 7, msgCount: 1, username: 'alice' }],
        version: 1,
      },
      ConditionExpression: 'attribute_not_exists(#chatId)',
      ExpressionAttributeNames: { '#chatId': 'chatId' },
    })
  })

  test('re-reads and retries after a concurrent update conflict', async () => {
    querySpy
      .mockResolvedValueOnce({
        Items: [
          {
            chatId: '-100',
            chatInfo: chat,
            users: [{ id: 7, msgCount: 5, username: 'alice' }],
            version: 1,
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        Items: [
          {
            chatId: '-100',
            chatInfo: chat,
            users: [{ id: 7, msgCount: 6, username: 'alice' }],
            version: 2,
          },
        ],
      } as never)
    putSpy
      .mockRejectedValueOnce(
        Object.assign(new Error('write conflict'), {
          name: 'ConditionalCheckFailedException',
        }),
      )
      .mockResolvedValueOnce({} as never)

    await updateStatistics(user, chat)

    expect(querySpy).toHaveBeenCalledTimes(2)
    expect(putSpy).toHaveBeenCalledTimes(2)
    expect(putSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          users: [{ id: 7, msgCount: 7, username: 'alice' }],
          version: 3,
        }),
        ConditionExpression: '#version = :expectedVersion',
        ExpressionAttributeValues: { ':expectedVersion': 2 },
      }),
    )
  })

  test('upgrades legacy records that do not have a version', async () => {
    querySpy.mockResolvedValue({
      Items: [
        {
          chatId: '-100',
          chatInfo: chat,
          users: [{ id: 7, msgCount: 5, username: 'alice' }],
        },
      ],
    } as never)

    await updateStatistics(user, chat)

    expect(putSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({ version: 1 }),
        ConditionExpression: 'attribute_not_exists(#version)',
        ExpressionAttributeNames: { '#version': 'version' },
      }),
    )
  })

  test('updates opt-out state through the same version guard', async () => {
    querySpy.mockResolvedValue({
      Items: [
        {
          chatId: '-100',
          chatInfo: chat,
          users: [{ id: 7, msgCount: 5, username: 'alice' }],
          version: 4,
        },
      ],
    } as never)

    await expect(setUserOptOut(-100, 7, true)).resolves.toBe('updated')
    expect(putSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        Item: expect.objectContaining({
          users: [{ id: 7, msgCount: 5, username: 'alice', optedOut: true }],
          version: 5,
        }),
        ConditionExpression: '#version = :expectedVersion',
        ExpressionAttributeValues: { ':expectedVersion': 4 },
      }),
    )
  })
})
