import { searchYoutube } from '../youtube'

global.fetch = jest.fn()
const mockedFetch = fetch as jest.MockedFunction<typeof fetch>

describe('searchYoutube', () => {
  test('should return of youtube video:', async () => {
    mockedFetch.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue({ items: [{ id: { videoId: '4' } }] }),
    } as unknown as Response)

    const promise = searchYoutube('test query')

    expect(await promise).toEqual('https://youtu.be/4')
  })
  test('should return proper string when videos is not found', async () => {
    mockedFetch.mockResolvedValueOnce({
      json: jest.fn().mockResolvedValue({}),
    } as unknown as Response)

    const promise = searchYoutube('test query 2')

    expect(await promise).toEqual('No videos found')
  })
  test('should return proper string when something will go wrong', async () => {
    mockedFetch.mockRejectedValueOnce('error')
    const promise = searchYoutube('test query 3')

    expect(await promise).toEqual('No videos found')
  })
})
