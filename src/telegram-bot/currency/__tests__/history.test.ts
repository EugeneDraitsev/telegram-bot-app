import { getCurrencyHistory } from '../history'

const NOW = Date.UTC(2026, 10, 12, 7)

const respond = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 404, json: async () => body }) as Response

/** Serves the daily rates, except on `missingDate`, and the given Brent bars. */
function mockSources(brentBars: unknown[] | undefined, missingDate?: string) {
  jest.spyOn(Date, 'now').mockReturnValue(NOW)

  return jest.spyOn(globalThis, 'fetch').mockImplementation((async (
    input: unknown,
  ) => {
    const url = String(input)
    if (url.includes('cnbc.com')) {
      return brentBars
        ? respond({ barData: { priceBars: brentBars } })
        : respond({}, false)
    }

    const date = url.match(/currency-api@([\d-]+)/)?.[1]
    return date === missingDate
      ? respond({}, false)
      : respond({
          date,
          eur: { usd: 1.1, byn: 3.3, btc: 0.00002, eth: 0.0005, ada: 5.5 },
        })
  }) as unknown as typeof fetch)
}

describe('getCurrencyHistory', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('reads the last seven days and skips a day without rates', async () => {
    const fetchSpy = mockSources([], '2026-11-08')

    const history = await getCurrencyHistory()

    expect(history.map((day) => day.date)).toEqual([
      '2026-11-06',
      '2026-11-07',
      '2026-11-09',
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
    ])
    expect(history[0].rates).toEqual({
      USD: 1.1,
      BYN: 3.3,
      BTC: 0.00002,
      ETH: 0.0005,
      ADA: 5.5,
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@2026-11-06/v1/currencies/eur.min.json',
      expect.anything(),
    )
  })

  test('prices the coins in USD', async () => {
    mockSources([])

    const [{ prices }] = await getCurrencyHistory()

    expect(prices.BTC).toBeCloseTo(55000)
    expect(prices.ETH).toBeCloseTo(2200)
    expect(prices.ADA).toBeCloseTo(0.2)
  })

  test('carries the last Brent close over days without trading', async () => {
    const fetchSpy = mockSources([
      { close: '98.3200', tradeTime: '20261105000000' },
      { close: '92.5700', tradeTime: '20261109000000' },
    ])

    const history = await getCurrencyHistory()

    expect(history.map((day) => day.prices.BRENT)).toEqual([
      98.32, 98.32, 98.32, 92.57, 92.57, 92.57, 92.57,
    ])
    // Two weeks back, so a close from before the first day is there to carry.
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://ts-api.cnbc.com/harmony/app/bars/@LCO.1/1D/20261029000000/20261113000000/adjusted/EST5EDT.json',
      expect.anything(),
    )
  })

  test('keeps the rates when the Brent history fails', async () => {
    mockSources(undefined)

    const history = await getCurrencyHistory()

    expect(history).toHaveLength(7)
    expect(history.every((day) => day.prices.BRENT === undefined)).toBe(true)
  })
})
