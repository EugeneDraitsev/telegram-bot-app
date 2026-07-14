import { getMainCurrencySection } from '../main-currency'

describe('main currency section', () => {
  test('derives BYN cross-rates from the primary rates response', async () => {
    const section = await getMainCurrencySection(
      Promise.resolve({
        provider: 'ExchangeRate',
        rates: {
          BYN: 3.6,
          EUR: 1,
          PLN: 4.2,
          SEK: 11,
          UAH: 50,
          USD: 1.2,
        },
      }),
    )

    expect(section.rows[0]).toEqual({
      label: '🇧🇾BYN',
      values: ['3.00', '3.60'],
    })
  })
})
