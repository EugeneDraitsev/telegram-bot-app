import {
  fetchGiphyGifs,
  type GiphyGif,
  getMediaUrl,
  searchGiphyGif,
} from '../search-gif.tool'

const MOCK_GIF = {
  id: 'abc123',
  images: {
    original_mp4: { mp4: 'https://media.giphy.com/media/abc123/giphy.mp4' },
    original: {
      url: 'https://media.giphy.com/media/abc123/giphy.gif',
      mp4: 'https://media.giphy.com/media/abc123/original.mp4',
    },
    downsized: {
      url: 'https://media.giphy.com/media/abc123/giphy-downsized.gif',
    },
    fixed_height: {
      url: 'https://media.giphy.com/media/abc123/200.gif',
    },
  },
}

const MOCK_GIF_NO_MP4 = {
  id: 'def456',
  images: {
    original: {
      url: 'https://media.giphy.com/media/def456/giphy.gif',
    },
  },
}

const mockGiphyResponse = (data: unknown[]) =>
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json({ data }) as never)

describe('getMediaUrl', () => {
  test('should prefer original_mp4 over other formats', () => {
    const url = getMediaUrl(MOCK_GIF)
    expect(url).toBe('https://media.giphy.com/media/abc123/giphy.mp4')
  })

  test('should fall back to original url when no mp4', () => {
    const url = getMediaUrl(MOCK_GIF_NO_MP4)
    expect(url).toBe('https://media.giphy.com/media/def456/giphy.gif')
  })

  test('should return null when no images available', () => {
    const url = getMediaUrl({ images: {} } satisfies GiphyGif)
    expect(url).toBeNull()
  })
})

describe('fetchGiphyGifs', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  test('should throw when API key is not configured', async () => {
    process.env = { ...originalEnv, GIPHY_API_KEY: '' }
    await expect(fetchGiphyGifs('gifs/search', { q: 'cat' })).rejects.toThrow(
      'Giphy API key not configured',
    )
  })

  test('should throw on non-OK responses', async () => {
    process.env = { ...originalEnv, GIPHY_API_KEY: 'test-giphy-key' }
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 429 }) as never)

    await expect(fetchGiphyGifs('gifs/search', { q: 'cat' })).rejects.toThrow(
      'Giphy API error: 429',
    )
  })
})

describe('searchGiphyGif', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, GIPHY_API_KEY: 'test-giphy-key' }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  test('should return a media URL from Giphy search results', async () => {
    const fetchSpy = mockGiphyResponse([MOCK_GIF])

    const result = await searchGiphyGif('funny cat')

    expect(result).toMatch(/^https:\/\/media\.giphy\.com\//)
    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v1/gifs/search')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api_key: 'test-giphy-key',
      q: 'funny cat',
      limit: '20',
      rating: 'g',
      lang: 'en',
    })
  })

  test('should return null when no results found', async () => {
    mockGiphyResponse([])

    const result = await searchGiphyGif('nonexistent query xyz')
    expect(result).toBeNull()
  })

  test('should propagate API errors', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('API rate limit'))

    await expect(searchGiphyGif('test')).rejects.toThrow('API rate limit')
  })
})
