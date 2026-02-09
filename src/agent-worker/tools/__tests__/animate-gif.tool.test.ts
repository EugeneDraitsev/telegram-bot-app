import { type GifsResult, GiphyFetch } from '@giphy/js-fetch-api'

import { animateGiphyText } from '../animate-gif.tool'

const MOCK_ANIMATED_GIF = {
  id: 'anim123',
  images: {
    original_mp4: { mp4: 'https://media.giphy.com/media/anim123/giphy.mp4' },
    original: {
      url: 'https://media.giphy.com/media/anim123/giphy.gif',
    },
  },
}

describe('animateGiphyText', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, GIPHY_API_KEY: 'test-giphy-key' }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  test('should return a media URL from animate results', async () => {
    jest
      .spyOn(GiphyFetch.prototype, 'animate')
      .mockResolvedValue({ data: [MOCK_ANIMATED_GIF] } as unknown as GifsResult)

    const result = await animateGiphyText('Happy Birthday!')

    expect(result).toBe('https://media.giphy.com/media/anim123/giphy.mp4')
    expect(GiphyFetch.prototype.animate).toHaveBeenCalledWith(
      'Happy Birthday!',
      { limit: 10 },
    )
  })

  test('should return null when no results', async () => {
    jest
      .spyOn(GiphyFetch.prototype, 'animate')
      .mockResolvedValue({ data: [] } as unknown as GifsResult)

    const result = await animateGiphyText('xyz')
    expect(result).toBeNull()
  })

  test('should propagate API errors', async () => {
    jest
      .spyOn(GiphyFetch.prototype, 'animate')
      .mockRejectedValue(new Error('Animate failed'))

    await expect(animateGiphyText('test')).rejects.toThrow('Animate failed')
  })
})
