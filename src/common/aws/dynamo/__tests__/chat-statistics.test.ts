import type { Chat } from 'grammy/types'

import * as utils from '../../../utils'
import {
  buildFormattedChatStatisticsMessages,
  getStoredChatStatistics,
  setUserOptOut,
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
  const chat = { id: -100, type: 'group', title: 'Test chat' } as Chat

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

  test('reads chat statistics only from per-user records', async () => {
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
      {
        chatId: '-100',
        userId: 8,
        msgCount: 2,
        username: 'bob',
        chatInfo: chat,
        updatedAt: 5,
      },
    ])

    await expect(getStoredChatStatistics(-100)).resolves.toEqual({
      chatId: '-100',
      chatInfo: currentChat,
      users: [
        { id: 7, msgCount: 8, username: 'alice', optedOut: undefined },
        { id: 8, msgCount: 2, username: 'bob', optedOut: undefined },
      ],
    })
    expect(querySpy).not.toHaveBeenCalled()
  })
})
