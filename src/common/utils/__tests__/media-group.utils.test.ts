import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { getRawHistory } from '../../upstash'
import { isAiEnabledChat } from '../ai.utils'
import { getMediaGroupMessages } from '../media-group.utils'

jest.mock('../../upstash', () => ({
  getRawHistory: jest.fn(),
}))

jest.mock('../ai.utils', () => ({
  isAiEnabledChat: jest.fn(),
}))

const mockGetRawHistory = getRawHistory as jest.MockedFunction<
  typeof getRawHistory
>
const mockIsAiEnabledChat = isAiEnabledChat as jest.MockedFunction<
  typeof isAiEnabledChat
>

async function advanceAlbumWait() {
  jest.advanceTimersByTime(4_000)
  await Promise.resolve()
  await Promise.resolve()
}

describe('getMediaGroupMessages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockIsAiEnabledChat.mockReturnValue(true)
    jest.useRealTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  test('returns empty array when context has no message', async () => {
    const ctx = { chat: { id: 1 } } as Context

    const result = await getMediaGroupMessages(ctx)

    expect(result).toEqual([])
    expect(mockGetRawHistory).not.toHaveBeenCalled()
  })

  test('does not poll current media group when chat is not AI-enabled', async () => {
    mockIsAiEnabledChat.mockReturnValueOnce(false)

    const ctx = {
      chat: { id: 1 },
      message: { message_id: 10, media_group_id: 'group_1' },
    } as unknown as Context

    const result = await getMediaGroupMessages(ctx)

    expect(result).toEqual([])
    expect(mockGetRawHistory).not.toHaveBeenCalled()
  })

  test('returns empty array when message is not related to a media group', async () => {
    const ctx = {
      chat: { id: 1 },
      message: { message_id: 100 },
    } as unknown as Context

    const result = await getMediaGroupMessages(ctx)

    expect(result).toEqual([])
    expect(mockGetRawHistory).not.toHaveBeenCalled()
  })

  test('collects messages from current media group and excludes current message', async () => {
    jest.useFakeTimers()

    const history = [
      { message_id: 10, media_group_id: 'group_1' },
      { message_id: 11, media_group_id: 'group_1' },
      { message_id: 12, media_group_id: 'group_2' },
    ] as unknown as Message[]
    mockGetRawHistory.mockResolvedValue(history)

    const ctx = {
      chat: { id: 1 },
      message: { message_id: 10, media_group_id: 'group_1' },
    } as unknown as Context

    const resultPromise = getMediaGroupMessages(ctx)

    expect(mockGetRawHistory).not.toHaveBeenCalled()

    await advanceAlbumWait()

    const result = await resultPromise

    expect(mockGetRawHistory).toHaveBeenCalledTimes(1)
    expect(result).toEqual([{ message_id: 11, media_group_id: 'group_1' }])
  })

  test('reads current media group after waiting for sibling messages', async () => {
    jest.useFakeTimers()

    const fullHistory = [
      { message_id: 10, media_group_id: 'group_1' },
      { message_id: 11, media_group_id: 'group_1' },
      { message_id: 12, media_group_id: 'group_1' },
    ] as unknown as Message[]
    mockGetRawHistory.mockResolvedValueOnce(fullHistory)

    const ctx = {
      chat: { id: 1 },
      message: { message_id: 10, media_group_id: 'group_1' },
    } as unknown as Context

    const resultPromise = getMediaGroupMessages(ctx)

    expect(mockGetRawHistory).not.toHaveBeenCalled()

    await advanceAlbumWait()

    const result = await resultPromise

    expect(mockGetRawHistory).toHaveBeenCalledTimes(1)
    expect(result).toEqual([
      { message_id: 11, media_group_id: 'group_1' },
      { message_id: 12, media_group_id: 'group_1' },
    ])
  })

  test('collects messages from replied media group without waiting', async () => {
    jest.useFakeTimers()

    const history = [
      { message_id: 20, media_group_id: 'group_reply' },
      { message_id: 21, media_group_id: 'group_reply' },
      { message_id: 22, media_group_id: 'group_other' },
    ] as unknown as Message[]
    mockGetRawHistory.mockResolvedValueOnce(history)

    const ctx = {
      chat: { id: 1 },
      message: {
        message_id: 999,
        reply_to_message: { media_group_id: 'group_reply' },
      },
    } as unknown as Context

    const resultPromise = getMediaGroupMessages(ctx)

    expect(mockGetRawHistory).toHaveBeenCalledTimes(1)

    const result = await resultPromise

    expect(mockGetRawHistory).toHaveBeenCalledTimes(1)
    expect(result).toEqual([
      { message_id: 20, media_group_id: 'group_reply' },
      { message_id: 21, media_group_id: 'group_reply' },
    ])
  })
})
