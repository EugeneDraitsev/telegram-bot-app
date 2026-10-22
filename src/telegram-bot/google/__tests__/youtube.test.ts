import { searchYoutube } from '../youtube'

describe('searchYoutube', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('should return of youtube video:', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: { videoId: '4' } }] }),
      )

    const promise = searchYoutube('test query')

    expect(await promise).toEqual('https://youtu.be/4')
  })
  test('keeps ampersands and hashes inside the search query', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({}))

    await searchYoutube('rock & roll #1')

    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.searchParams.get('q')).toBe('rock & roll #1')
    expect(fetchSpy.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
  })
  test('should return proper string when videos is not found', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}))

    const promise = searchYoutube('test query 2')

    expect(await promise).toEqual('No videos found')
  })
  test('should return proper string when something will go wrong', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce('error')
    const promise = searchYoutube('test query 3')

    expect(await promise).toEqual('No videos found')
  })
})
