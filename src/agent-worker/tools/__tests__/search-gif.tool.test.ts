import { type GifsResult, GiphyFetch } from '@giphy/js-fetch-api'
import type { IGif } from '@giphy/js-types'

import { getGiphyClient, getMediaUrl, searchGiphyGif } from '../search-gif.tool'

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

describe('getMediaUrl', () => {
  test('should prefer original_mp4 over other formats', () => {
    const url = getMediaUrl(MOCK_GIF as unknown as IGif)
    expect(url).toBe('https://media.giphy.com/media/abc123/giphy.mp4')
  })

  test('should fall back to original url when no mp4', () => {
    const url = getMediaUrl(MOCK_GIF_NO_MP4 as unknown as IGif)
    expect(url).toBe('https://media.giphy.com/media/def456/giphy.gif')
  })

  test('should return null when no images available', () => {
    const url = getMediaUrl({ id: 'empty', images: {} } as unknown as IGif)
    expect(url).toBeNull()
  })
})

describe('getGiphyClient', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
  })

  test('should throw when API key is not configured', () => {
    process.env = { ...originalEnv, GIPHY_API_KEY: '' }
    expect(() => getGiphyClient()).toThrow('Giphy API key not configured')
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
    jest
      .spyOn(GiphyFetch.prototype, 'search')
      .mockResolvedValue({ data: [MOCK_GIF] } as unknown as GifsResult)

    const result = await searchGiphyGif('funny cat')

    expect(result).toBeTruthy()
    expect(result).toMatch(/^https:\/\/media\.giphy\.com\//)
    expect(GiphyFetch.prototype.search).toHaveBeenCalledWith('funny cat', {
      limit: 20,
      rating: 'g',
      lang: 'en',
    })
  })

  test('should return null when no results found', async () => {
    jest
      .spyOn(GiphyFetch.prototype, 'search')
      .mockResolvedValue({ data: [] } as unknown as GifsResult)

    const result = await searchGiphyGif('nonexistent query xyz')
    expect(result).toBeNull()
  })

  test('should propagate API errors', async () => {
    jest
      .spyOn(GiphyFetch.prototype, 'search')
      .mockRejectedValue(new Error('API rate limit'))

    await expect(searchGiphyGif('test')).rejects.toThrow('API rate limit')
  })
})
