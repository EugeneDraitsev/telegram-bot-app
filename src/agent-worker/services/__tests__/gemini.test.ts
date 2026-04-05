const mockGenerateContent = jest.fn()
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}
const mockWithTimeout = jest.fn(
  <T>(promise: Promise<T>, _ms: number, _error: Error | string) => promise,
)

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
    interactions: {
      create: jest.fn(),
    },
  })),
}))

jest.mock('@tg-bot/common', () => ({
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  logger: mockLogger,
}))

jest.mock('../../agent/utils', () => ({
  withTimeout: mockWithTimeout,
}))

const ORIGINAL_ENV = { ...process.env }
const { searchWeb } = require('../gemini') as typeof import('../gemini')

describe('searchWeb', () => {
  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      GEMINI_API_KEY: 'gemini-key',
      TAVILY_API_KEY: 'tvly-key',
      COMMON_GOOGLE_API_KEY: 'google-key',
      GOOGLE_CX_TOKEN: 'google-cx',
    }
    mockGenerateContent.mockReset()
    mockWithTimeout.mockClear()
    mockLogger.info.mockReset()
    mockLogger.warn.mockReset()
    mockLogger.error.mockReset()
    global.fetch = jest.fn() as typeof fetch
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  test('returns grounded search response on primary model success', async () => {
    mockGenerateContent.mockResolvedValue({
      text: '**Fresh** answer with `link`',
    })

    await expect(searchWeb('btc price today', 'brief')).resolves.toBe(
      'Fresh answer with link',
    )

    expect(mockGenerateContent).toHaveBeenCalledTimes(1)
    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-3.1-flash-lite-preview',
      contents: expect.stringContaining('Query: btc price today'),
      config: {
        tools: [{ googleSearch: {} }],
      },
    })
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'btc price today',
        searchType: 'gemini_google_search_primary',
        model: 'gemini-3.1-flash-lite-preview',
      }),
      'web_search.success',
    )
  })

  test('falls back to preview grounded model before using external search', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('primary overloaded'))
      .mockResolvedValueOnce({
        text: 'backup grounded answer',
      })

    await expect(searchWeb('latest nvidia drivers')).resolves.toBe(
      'backup grounded answer',
    )

    expect(
      mockGenerateContent.mock.calls.map(([params]) => params.model),
    ).toEqual(['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('falls back to Tavily results when grounded search fails', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockRejectedValueOnce(new Error('preview failed'))

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Short Tavily answer',
        results: [
          {
            title: 'First result',
            content: 'Useful fresh snippet',
            url: 'https://example.com/one',
            score: 0.92,
          },
        ],
      }),
    })

    await expect(
      searchWeb('ignored query', 'brief', {
        groundedPrompt: 'Find one relevant source.\nQuery: real fallback query',
        fallbackQuery: 'real fallback query',
      }),
    ).resolves.toContain('Short Tavily answer')

    expect(mockGenerateContent).toHaveBeenCalledTimes(2)
    expect(mockGenerateContent).toHaveBeenNthCalledWith(1, {
      model: 'gemini-3.1-flash-lite-preview',
      contents: 'Find one relevant source.\nQuery: real fallback query',
      config: {
        tools: [{ googleSearch: {} }],
      },
    })

    const [url, request] = (global.fetch as jest.Mock).mock.calls[0]
    expect(url).toBe('https://api.tavily.com/search')
    expect(request).toEqual(
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer tvly-key',
        }),
      }),
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'real fallback query',
        searchType: 'tavily',
      }),
      'web_search.success',
    )
  })

  test('derives fallback query from groundedPrompt when fallbackQuery is omitted', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockRejectedValueOnce(new Error('backup failed'))

    ;(global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        answer: 'Short Tavily answer',
        results: [],
      }),
    })

    await expect(
      searchWeb('ignored raw query', 'brief', {
        groundedPrompt:
          'Find one relevant source.\nReturn concise results.\nQuery: exact fallback query',
      }),
    ).resolves.toContain('Short Tavily answer')

    const [, request] = (global.fetch as jest.Mock).mock.calls[0]
    expect(JSON.parse(request.body as string)).toEqual(
      expect.objectContaining({
        query: 'exact fallback query',
      }),
    )
  })

  test('preserves backward compatibility when query already contains a grounded prompt', async () => {
    mockGenerateContent.mockResolvedValue({
      text: 'grounded prompt result',
    })

    const prompt =
      'Use fresh web information from Google Search.\nQuery: compat query\nAnswer in the same language as the query.'

    await expect(searchWeb(prompt, 'brief')).resolves.toBe(
      'grounded prompt result',
    )

    expect(mockGenerateContent).toHaveBeenCalledWith({
      model: 'gemini-3.1-flash-lite-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    })
  })

  test('falls back to Google Custom Search when Tavily also fails', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockRejectedValueOnce(new Error('backup failed'))

    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: 'tavily down',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              title: 'First result',
              displayLink: 'example.com',
              snippet: 'Useful fresh snippet',
              link: 'https://example.com/one',
            },
          ],
        }),
      })

    await expect(searchWeb('real fallback query')).resolves.toContain(
      'https://example.com/one',
    )

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'https://api.tavily.com/search',
    )
    expect((global.fetch as jest.Mock).mock.calls[1][0]).toContain(
      'q=real+fallback+query',
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'real fallback query',
        searchType: 'google_custom_search',
      }),
      'web_search.success',
    )
  })

  test('throws a single availability error when all search providers fail', async () => {
    mockGenerateContent
      .mockRejectedValueOnce(new Error('primary failed'))
      .mockRejectedValueOnce(new Error('preview failed'))

    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: 'tavily down',
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            message: 'custom search down',
          },
        }),
      })

    await expect(searchWeb('release date')).rejects.toThrow(
      'Web search unavailable: custom search down',
    )
  })
})
