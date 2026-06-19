const mockFetchBrentPrice = jest.fn()

jest.mock('../brent', () => ({
  fetchBrentPrice: mockFetchBrentPrice,
}))

import { getRussianCurrencySection } from '../russian-currency'

describe('getRussianCurrencySection', () => {
  beforeEach(() => {
    mockFetchBrentPrice.mockReset()
  })

  test('formats ruble values with dollar prefix', async () => {
    mockFetchBrentPrice.mockResolvedValue(79.54)

    const section = await getRussianCurrencySection(
      Promise.resolve({
        provider: 'ExchangeRate',
        rates: {
          EUR: 1,
          RUB: 84.15,
          USD: 1.1469,
        },
      }),
    )

    expect(section.rows).toEqual([
      { label: 'USD/RUB', value: '$73.37' },
      { label: 'EUR/RUB', value: '$84.15' },
      { label: '\u{1F6E2}Brent', value: '$79.54' },
    ])
  })
})
