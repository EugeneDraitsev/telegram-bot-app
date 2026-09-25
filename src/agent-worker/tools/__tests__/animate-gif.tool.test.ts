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

const mockGiphyResponse = (data: unknown[]) =>
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json({ data }) as never)

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
    const fetchSpy = mockGiphyResponse([MOCK_ANIMATED_GIF])

    const result = await animateGiphyText('Happy Birthday!')

    expect(result).toBe('https://media.giphy.com/media/anim123/giphy.mp4')
    const url = new URL(String(fetchSpy.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v1/text/animate')
    expect(url.searchParams.get('m')).toBe('Happy Birthday!')
    expect(url.searchParams.get('limit')).toBe('10')
  })

  test('should return null when no results', async () => {
    mockGiphyResponse([])

    const result = await animateGiphyText('xyz')
    expect(result).toBeNull()
  })

  test('should propagate API errors', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Animate failed'))

    await expect(animateGiphyText('test')).rejects.toThrow('Animate failed')
  })
})
