import type { Message } from 'grammy/types'

import * as configuration from '../../aws/dynamo'
import {
  CHAT_HISTORY_PHYSICAL_TTL_SECONDS,
  clearChatHistoryMaintenanceCache,
  DEFAULT_AGENT_HISTORY_LIMIT,
  formatHistoryForDisplay,
  getRecentRawHistory,
  saveMessage,
} from '../chat-history'
import * as client from '../client'

const mockZrange = jest.fn()
const mockZadd = jest.fn()
const mockZremrangebyscore = jest.fn()
const mockExpire = jest.fn()

const mockGetRedisClient = jest
  .spyOn(client, 'getRedisClient')
  .mockReturnValue({
    zrange: mockZrange,
    zadd: mockZadd,
    zremrangebyscore: mockZremrangebyscore,
    expire: mockExpire,
  } as unknown as ReturnType<typeof client.getRedisClient>)

const mockIsAiAllowedChat = jest.spyOn(configuration, 'isAiAllowedChat')

function createMessage(
  messageId: number,
  overrides: Partial<Message> = {},
): Message {
  return {
    message_id: messageId,
    date: 1_710_000_000 + messageId,
    chat: { id: 777, type: 'group' },
    from: {
      id: 1000 + messageId,
      is_bot: false,
      first_name: `User ${messageId}`,
    },
    text: `message-${String(messageId).padStart(3, '0')}`,
    ...overrides,
  } as Message
}

beforeEach(() => {
  clearChatHistoryMaintenanceCache()
  mockZrange.mockReset()
  mockZadd.mockReset().mockResolvedValue(1)
  mockZremrangebyscore.mockReset().mockResolvedValue(0)
  mockExpire.mockReset().mockResolvedValue(1)
  mockIsAiAllowedChat.mockReset().mockResolvedValue(true)
})

afterAll(() => {
  mockGetRedisClient.mockRestore()
  mockIsAiAllowedChat.mockRestore()
})

describe('formatHistoryForDisplay', () => {
  test('returns the last 40 messages by default', () => {
    const messages = Array.from({ length: 45 }, (_, index) =>
      createMessage(index + 1),
    )

    const history = formatHistoryForDisplay(messages)

    expect(history).toContain(`Recent ${DEFAULT_AGENT_HISTORY_LIMIT} messages:`)
    expect(history).toContain('message-045')
    expect(history).not.toContain('message-005')
    expect(history).toContain('message-006')
  })

  test('includes media details in the formatted output', () => {
    const history = formatHistoryForDisplay([
      createMessage(1, {
        text: undefined,
        caption: 'look at this',
        photo: [
          {
            file_id: 'photo_1',
            file_unique_id: 'photo_1_unique',
            width: 100,
            height: 100,
          },
        ],
        video: {
          file_id: 'video_1',
          file_unique_id: 'video_1_unique',
          width: 1280,
          height: 720,
          duration: 10,
          mime_type: 'video/mp4',
        },
      }),
      createMessage(2, {
        text: undefined,
        document: {
          file_id: 'doc_1',
          file_unique_id: 'doc_1_unique',
          file_name: 'manual.pdf',
          mime_type: 'application/pdf',
        },
      }),
    ])

    expect(history).toContain(
      'look at this [media: photo, video; load_chat_media: images only]',
    )
    expect(history).toContain(
      '[media: document (application/pdf); load_chat_media: images only]',
    )
    expect(history).toContain('message_id=1')
    expect(history).toContain('message_id=2')
  })

  test('formats a message id without leading whitespace when date is absent', () => {
    const history = formatHistoryForDisplay([
      {
        message_id: 8,
        text: 'undated message',
        from: { id: 1, is_bot: false, first_name: 'Eugene' },
      } as Message,
    ])

    expect(history).toContain('[message_id=8] Eugene: undated message')
    expect(history).not.toContain('[ message_id=8]')
  })

  test('renders rich bot replies instead of an empty message marker', () => {
    const history = formatHistoryForDisplay([
      createMessage(9, {
        text: undefined,
        from: { id: 1, is_bot: true, first_name: 'illuminati chat bot' },
        rich_message: {
          blocks: [
            { type: 'paragraph', text: 'Безопасный маршрут:' },
            { type: 'paragraph', text: { type: 'bold', text: 'к врачу' } },
          ],
        },
      } as Partial<Message>),
    ])

    expect(history).toContain('Bot: Безопасный маршрут:\nк врачу')
    expect(history).not.toContain('[empty message]')
  })

  test('can render the full available history when requested explicitly', () => {
    const messages = Array.from({ length: 3 }, (_, index) =>
      createMessage(index + 1),
    )

    const history = formatHistoryForDisplay(messages, {
      limit: messages.length,
      headerLabel: 'Available history',
    })

    expect(history).toContain('Available history 3 messages:')
    expect(history).toContain('message-001')
    expect(history).toContain('message-003')
  })

  test('can omit the current message from auto-injected history', () => {
    const history = formatHistoryForDisplay(
      [createMessage(1), createMessage(2), createMessage(3)],
      {
        excludeMessageId: 3,
        includeHeader: false,
      },
    )

    expect(history).toContain('message-001')
    expect(history).toContain('message-002')
    expect(history).not.toContain('message-003')
  })
})

describe('getRecentRawHistory', () => {
  test('limits the visible window without write-amplifying reads', async () => {
    mockZrange.mockResolvedValue([createMessage(3), createMessage(2)])

    const history = await getRecentRawHistory(777, 2)

    expect(mockZrange).toHaveBeenCalledWith(
      'chat-history:777',
      expect.any(Number),
      expect.any(Number),
      {
        byScore: true,
        rev: true,
        offset: 0,
        count: 2,
      },
    )
    expect(mockZremrangebyscore).not.toHaveBeenCalled()
    expect(history.map((message) => message.message_id)).toEqual([2, 3])
  })
})

describe('saveMessage', () => {
  test('does not persist history outside the owner allowlist', async () => {
    mockIsAiAllowedChat.mockResolvedValue(false)

    await saveMessage(createMessage(1), 777)

    expect(mockZadd).not.toHaveBeenCalled()
    expect(mockZremrangebyscore).not.toHaveBeenCalled()
    expect(mockExpire).not.toHaveBeenCalled()
  })

  test('adds every message but runs retention maintenance only once per hour', async () => {
    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(1_800_000_000_000)
    const firstMessage = createMessage(1)
    const secondMessage = createMessage(2)

    await saveMessage(firstMessage, 777)
    await saveMessage(secondMessage, 777)
    dateNowSpy.mockRestore()

    // Scored by the message's own Telegram date, tie-broken by message id, so
    // the entry lands in the same place no matter when we process it.
    expect(mockZadd).toHaveBeenCalledWith(
      'chat-history:777',
      { nx: true },
      {
        score: (1_710_000_000 + 1) * 1000 + 1 / 1000,
        member: JSON.stringify(firstMessage),
      },
    )
    expect(mockZadd).toHaveBeenCalledTimes(2)
    expect(mockZremrangebyscore).toHaveBeenCalledTimes(1)
    expect(mockZremrangebyscore).toHaveBeenCalledWith(
      'chat-history:777',
      0,
      1_800_000_000_000 - 24 * 60 * 60 * 1000,
    )
    expect(mockExpire).toHaveBeenCalledTimes(1)
    expect(mockExpire).toHaveBeenCalledWith(
      'chat-history:777',
      CHAT_HISTORY_PHYSICAL_TTL_SECONDS,
    )
  })

  test('keeps same-second messages ordered across a tie-breaker boundary', async () => {
    const sameSecond = { date: 1_710_000_000 }
    await saveMessage(createMessage(999, sameSecond), 777)
    await saveMessage(createMessage(1000, sameSecond), 777)
    await saveMessage(createMessage(1001, sameSecond), 777)

    const scores = mockZadd.mock.calls.map((call) => call[2].score)
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
    expect(new Set(scores).size).toBe(3)
  })

  test('replaying a message keeps its original place in history', async () => {
    const message = createMessage(5)

    const dateNowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(1_800_000_000_000)
    await saveMessage(message, 777)
    dateNowSpy.mockReturnValue(1_800_000_999_000)
    await saveMessage(message, 777)
    dateNowSpy.mockRestore()

    const [first, second] = mockZadd.mock.calls
    expect(second?.[1]).toEqual({ nx: true })
    expect(second?.[2]).toEqual(first?.[2])
  })
})
