import type { Message } from 'telegram-typings'

import * as common from '@tg-bot/common'
import { runWithToolContext } from '../context'
import { getHistoryTool } from '../get-history.tool'

const mockedGetRawHistory = jest.spyOn(common, 'getRawHistory')
const mockedGetRecentRawHistory = jest.spyOn(common, 'getRecentRawHistory')

const TEST_MESSAGE = {
  message_id: 999,
  chat: { id: 777, type: 'group' },
} as Message

function createHistoryMessage(messageId: number): Message {
  return {
    message_id: messageId,
    date: 1_710_000_000 + messageId,
    chat: { id: 777, type: 'group' },
    from: {
      id: 1000 + messageId,
      is_bot: false,
      first_name: `User ${messageId}`,
    },
    text: `history-${messageId}`,
  } as Message
}

describe('getHistoryTool', () => {
  beforeEach(() => {
    mockedGetRawHistory.mockReset()
    mockedGetRecentRawHistory.mockReset()
  })

  test('uses 40 recent messages by default', async () => {
    mockedGetRecentRawHistory.mockResolvedValue(
      Array.from({ length: 45 }, (_, index) => createHistoryMessage(index + 1)),
    )

    const result = await runWithToolContext(TEST_MESSAGE, undefined, () =>
      getHistoryTool.execute({}),
    )

    expect(mockedGetRecentRawHistory).toHaveBeenCalledWith(777, 40)
    expect(mockedGetRawHistory).not.toHaveBeenCalled()
    expect(result).toContain(
      `Recent ${common.DEFAULT_AGENT_HISTORY_LIMIT} messages:`,
    )
    expect(result).toContain('history-45')
    expect(result).not.toContain('history-5\n')
  })

  test('can request all available history explicitly', async () => {
    mockedGetRawHistory.mockResolvedValue([
      createHistoryMessage(1),
      createHistoryMessage(2),
      createHistoryMessage(3),
    ])

    const result = await runWithToolContext(TEST_MESSAGE, undefined, () =>
      getHistoryTool.execute({ all: true }),
    )

    expect(result).toContain('Available history 3 messages:')
    expect(result).toContain('history-1')
    expect(result).toContain('history-3')
    expect(mockedGetRecentRawHistory).not.toHaveBeenCalled()
  })

  test('respects a larger custom limit when requested', async () => {
    mockedGetRecentRawHistory.mockResolvedValue(
      Array.from({ length: 60 }, (_, index) => createHistoryMessage(index + 1)),
    )

    const result = await runWithToolContext(TEST_MESSAGE, undefined, () =>
      getHistoryTool.execute({ limit: 55 }),
    )

    expect(mockedGetRecentRawHistory).toHaveBeenCalledWith(777, 55)
    expect(mockedGetRawHistory).not.toHaveBeenCalled()
    expect(result).toContain('Recent 55 messages:')
    expect(result).toContain('history-60')
    expect(result).not.toContain('history-5\n')
    expect(result).toContain('history-6')
  })

  test('clamps oversized custom limit to the safe maximum', async () => {
    mockedGetRecentRawHistory.mockResolvedValue(
      Array.from({ length: 210 }, (_, index) =>
        createHistoryMessage(index + 1),
      ),
    )

    const result = await runWithToolContext(TEST_MESSAGE, undefined, () =>
      getHistoryTool.execute({ limit: 999 }),
    )

    expect(mockedGetRecentRawHistory).toHaveBeenCalledWith(
      777,
      common.MAX_HISTORY_TOOL_LIMIT,
    )
    expect(mockedGetRawHistory).not.toHaveBeenCalled()
    expect(result).toContain(
      `Recent ${common.MAX_HISTORY_TOOL_LIMIT} messages:`,
    )
  })
})
