import { buildCurrencyMessages } from '../format'

describe('currency rich formatting', () => {
  test('builds headerless rich tables and compact HTML fallback', () => {
    const messages = buildCurrencyMessages([
      {
        title: 'Основные пары',
        provider: 'ExchangeRate',
        columns: ['Пара', 'Курс'],
        rows: [
          { label: '🇧🇾USD/BYN', value: '3.27' },
          { label: '🇸🇪EUR|SEK', value: '11.42' },
        ],
        note: 'BYN uses BSB cash sell rates when available.',
      },
      {
        title: 'Крипта',
        provider: 'OKX',
        columns: ['Монета', 'Цена / 24ч'],
        rows: [{ label: 'ADA', value: '$0.17 (+2.1%)' }],
      },
    ])

    expect(messages.richMessage).toEqual(
      expect.objectContaining({ skip_entity_detection: true }),
    )
    expect(messages.richMessage.html).toContain('<b>💱 Курсы</b>')
    expect(messages.richMessage.html).toContain(
      '<b>Основные пары (ExchangeRate)</b>',
    )
    expect(messages.richMessage.html).toContain('<table bordered striped>')
    expect(messages.richMessage.html).toContain(
      '<td align="left">🇸🇪 EUR|SEK</td><td align="right">11.42</td>',
    )
    expect(messages.richMessage.html).toContain(
      '<td align="left">ADA</td><td align="right">$0.17 (+2.1%)</td>',
    )
    expect(messages.richMessage.html).not.toContain('<th>')
    expect(messages.richMessage.html).not.toContain('Пара')
    expect(messages.richMessage.html).not.toContain('Монета')
    expect(messages.richMessage.html).not.toContain(
      'BYN uses BSB cash sell rates when available.',
    )
    expect(messages.text).toContain('<b>Основные пары (ExchangeRate):</b>')
    expect(messages.text).toContain('🇧🇾USD/BYN: 3.27')
    expect(messages.text).toContain('🇸🇪EUR|SEK: 11.42')
    expect(messages.text).toContain('<b>Крипта (OKX):</b>')
    expect(messages.text).toContain('ADA: $0.17 (+2.1%)')
  })

  test('renders provider errors without a broken table', () => {
    const messages = buildCurrencyMessages([
      {
        title: 'crypto',
        provider: 'crypto',
        rows: [],
        error: "Can't fetch currency from crypto",
      },
    ])

    expect(messages.richMessage.html).toContain(
      '<i>Can&apos;t fetch currency from crypto</i>',
    )
    expect(messages.text).toContain('Can&apos;t fetch currency from crypto')
  })
})
