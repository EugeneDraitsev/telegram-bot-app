import { searchImage } from '../image-search.utils'

const image = {
  thumbnail: { src: 'https://imgs.search.brave.com/thumb.jpg' },
  properties: { url: 'https://example.com/cat.jpg' },
}

describe('searchImage', () => {
  const originalApiKey = process.env.BRAVE_API_KEY

  beforeEach(() => {
    process.env.BRAVE_API_KEY = 'test-key'
  })

  afterEach(() => {
    jest.restoreAllMocks()
    process.env.BRAVE_API_KEY = originalApiKey
  })

  test('returns the original image and its Brave thumbnail', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ results: [image, { properties: {} }] }),
      )

    await expect(searchImage('кот в шапке')).resolves.toEqual({
      url: 'https://example.com/cat.jpg',
      thumbnailUrl: 'https://imgs.search.brave.com/thumb.jpg',
    })
    const [url, request] = fetchSpy.mock.calls[0] ?? []
    expect(String(url)).toContain(`q=${encodeURIComponent('кот в шапке')}`)
    expect(String(url)).toContain('safesearch=off')
    expect(request?.headers).toMatchObject({
      'X-Subscription-Token': 'test-key',
    })
  })

  test('waits for the next rate limit slot before retrying', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ results: [image] }))

    await expect(searchImage('cat')).resolves.toMatchObject({
      url: 'https://example.com/cat.jpg',
    })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  test('reports an empty result set', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({}))

    await expect(searchImage('nothing')).rejects.toThrow(
      'No images found for: nothing',
    )
  })
})
