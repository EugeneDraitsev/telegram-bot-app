import type { Message } from 'telegram-typings'

import * as utils from '../../utils'
import {
  DEFAULT_AGENT_HISTORY_LIMIT,
  formatHistoryForDisplay,
  getRawHistory,
  getRecentRawHistory,
} from '../chat-history'
import * as client from '../client'

const mockZrange = jest.fn()

const mockGetRedisClient = jest
  .spyOn(client, 'getRedisClient')
  .mockReturnValue({
    zrange: mockZrange,
  } as unknown as ReturnType<typeof client.getRedisClient>)

const mockIsAiEnabledChat = jest.spyOn(utils, 'isAiEnabledChat')

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
  mockZrange.mockReset()
  mockIsAiEnabledChat.mockReset()
  mockIsAiEnabledChat.mockReturnValue(true)
})

afterAll(() => {
  mockGetRedisClient.mockRestore()
  mockIsAiEnabledChat.mockRestore()
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

    expect(history).toContain('look at this [media: photo, video]')
    expect(history).toContain('[media: document (application/pdf)]')
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
  test('getRawHistory and getRecentRawHistory share the same Redis range query', async () => {
    mockZrange.mockResolvedValue([
      createMessage(1),
      createMessage(2),
      createMessage(3),
    ])

    await getRawHistory(777)
    await getRecentRawHistory(777, 2)

    expect(mockZrange).toHaveBeenNthCalledWith(
      1,
      'chat-history:777',
      expect.any(Number),
      expect.any(Number),
      {
        byScore: true,
      },
    )
    expect(mockZrange).toHaveBeenNthCalledWith(
      2,
      'chat-history:777',
      expect.any(Number),
      expect.any(Number),
      {
        byScore: true,
      },
    )
  })

  test('reads recent history through the same raw-history path and slices locally', async () => {
    mockZrange.mockResolvedValue([
      createMessage(1),
      createMessage(2),
      createMessage(3),
    ])

    const history = await getRecentRawHistory(777, 2)

    expect(mockZrange).toHaveBeenCalledWith(
      'chat-history:777',
      expect.any(Number),
      expect.any(Number),
      {
        byScore: true,
      },
    )
    expect(history.map((message) => message.message_id)).toEqual([2, 3])
  })
})
