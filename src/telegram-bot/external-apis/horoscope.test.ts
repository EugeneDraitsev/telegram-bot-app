import { getHoroscope } from './horoscope'

describe('getHoroscope', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('escapes external content for Telegram HTML replies', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      json: async () => ({
        content: {
          text: [{ content: '<p>Good & <em>bright</em> "day"</p>' }],
        },
      }),
    }) as typeof fetch

    const response = await getHoroscope('овен')

    expect(response).toContain('Good &amp; bright &quot;day&quot;')
    expect(response).not.toContain('<p>')
    expect(response).not.toContain('<em>')
  })
})
