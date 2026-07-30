import {
  createStatisticsAccessToken,
  getChatStatisticsUrl,
  verifyStatisticsAccessToken,
} from '..'

const NOW = Date.UTC(2026, 6, 30)
const originalEnv = { ...process.env }

beforeAll(() => {
  process.env.STATISTICS_ACCESS_SECRET = 'test-statistics-secret'
})

afterAll(() => {
  process.env = originalEnv
})

describe('statistics access tokens', () => {
  test('authorizes only the signed chat before expiry', () => {
    const token = createStatisticsAccessToken('-123', NOW)

    expect(verifyStatisticsAccessToken('-123', token, NOW)).toBe(true)
    expect(verifyStatisticsAccessToken('-456', token, NOW)).toBe(false)
    expect(
      verifyStatisticsAccessToken(
        '-123',
        token,
        NOW + 31 * 24 * 60 * 60 * 1000,
      ),
    ).toBe(false)
  })

  test.each([undefined, '', 'v1.invalid.signature', 'v2.123.signature'])(
    'rejects malformed token %p',
    (token) => {
      expect(verifyStatisticsAccessToken('-123', token, NOW)).toBe(false)
    },
  )

  test('builds a signed frontend URL', () => {
    const url = new URL(getChatStatisticsUrl('-123'))

    expect(url.pathname).toBe('/chat/-123')
    expect(url.searchParams.get('access')).toBeTruthy()
  })
})
