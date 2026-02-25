import type { Message } from 'telegram-typings'

import { getRawHistory } from '../../upstash'
import { getMediaGroupMessagesFromHistory } from '../media-group.utils'

jest.mock('../../upstash', () => ({
  getRawHistory: jest.fn(),
}))

const mockGetRawHistory = getRawHistory as jest.MockedFunction<
  typeof getRawHistory
>

describe('getMediaGroupMessagesFromHistory', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useRealTimers()
  })

  test('returns empty result when message is not related to a media group', async () => {
    const result = await getMediaGroupMessagesFromHistory(1, 100)

    expect(result).toEqual([])
    expect(mockGetRawHistory).not.toHaveBeenCalled()
  })

  test('retries once for reply album when first read has only one message', async () => {
    const firstRead = [
      { message_id: 10, media_group_id: 'group_1' },
    ] as unknown as Message[]
    const secondRead = [
      { message_id: 10, media_group_id: 'group_1' },
      { message_id: 11, media_group_id: 'group_1' },
    ] as unknown as Message[]

    mockGetRawHistory
      .mockResolvedValueOnce(firstRead)
      .mockResolvedValueOnce(secondRead)

    const startedAt = Date.now()
    const result = await getMediaGroupMessagesFromHistory(
      1,
      999,
      undefined,
      'group_1',
      true,
    )

    expect(mockGetRawHistory).toHaveBeenCalledTimes(2)
    expect(result).toEqual(secondRead)
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900)
  })

  test('does not retry for reply album when first read already has multiple messages', async () => {
    const firstRead = [
      { message_id: 10, media_group_id: 'group_1' },
      { message_id: 11, media_group_id: 'group_1' },
    ] as unknown as Message[]

    mockGetRawHistory.mockResolvedValueOnce(firstRead)

    const result = await getMediaGroupMessagesFromHistory(
      1,
      999,
      undefined,
      'group_1',
      true,
    )

    expect(mockGetRawHistory).toHaveBeenCalledTimes(1)
    expect(result).toEqual(firstRead)
  })
})
