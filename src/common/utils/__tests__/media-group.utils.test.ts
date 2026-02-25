// import type { Message } from 'telegram-typings'
//
// import { getRawHistory } from '../../upstash'
// import { getMediaGroupMessagesFromHistory } from '../media-group.utils'
//
// jest.mock('../../upstash', () => ({
//   getRawHistory: jest.fn(),
// }))
//
// const mockGetRawHistory = getRawHistory as jest.MockedFunction<
//   typeof getRawHistory
// >
//
// describe('getMediaGroupMessagesFromHistory', () => {
//   beforeEach(() => {
//     jest.clearAllMocks()
//     jest.useRealTimers()
//   })
//
//   test('returns empty result when message is not related to a media group', async () => {
//     const result = await getMediaGroupMessagesFromHistory(1, 100)
//
//     expect(result).toEqual([])
//     expect(mockGetRawHistory).not.toHaveBeenCalled()
//   })
//
//   test('does not retry for reply album lookups', async () => {
//     const history = [
//       { message_id: 10, media_group_id: 'group_1' },
//       { message_id: 11, media_group_id: 'group_1' },
//     ] as unknown as Message[]
//
//     mockGetRawHistory.mockResolvedValueOnce(history)
//
//     const startedAt = Date.now()
//     const result = await getMediaGroupMessagesFromHistory(
//       1,
//       999,
//       undefined,
//       'group_1',
//       true,
//     )
//
//     expect(mockGetRawHistory).toHaveBeenCalledTimes(1)
//     expect(result).toEqual(history)
//     expect(Date.now() - startedAt).toBeLessThan(900)
//   })
//
//   test('waits before lookup when current message belongs to an album', async () => {
//     const history = [
//       { message_id: 10, media_group_id: 'group_1' },
//       { message_id: 11, media_group_id: 'group_1' },
//     ] as unknown as Message[]
//
//     mockGetRawHistory.mockResolvedValueOnce(history)
//
//     const startedAt = Date.now()
//     const result = await getMediaGroupMessagesFromHistory(
//       1,
//       10,
//       'group_1',
//       undefined,
//       true,
//     )
//
//     expect(mockGetRawHistory).toHaveBeenCalledTimes(1)
//     expect(result).toEqual([{ message_id: 11, media_group_id: 'group_1' }])
//     expect(Date.now() - startedAt).toBeGreaterThanOrEqual(900)
//   })
// })
