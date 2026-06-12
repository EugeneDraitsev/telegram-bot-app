import { buildCurrencyMessages } from '../format'

describe('currency rich formatting', () => {
  test('builds a rich table board and compact HTML fallback', () => {
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

    expect(messages.richMarkdown).toContain('**💱 Курсы**')
    expect(messages.richMarkdown).toContain('**Основные пары (ExchangeRate)**')
    expect(messages.richMarkdown).toContain('| Пара | Курс |')
    expect(messages.richMarkdown).toContain('| 🇸🇪EUR\\|SEK | 11.42 |')
    expect(messages.richMarkdown).toContain('| Монета | Цена / 24ч |')
    expect(messages.richMarkdown).toContain('| ADA | $0.17 (+2.1%) |')
    expect(messages.richMarkdown).not.toContain('| Монета | Цена | 24ч |')
    expect(messages.richMarkdown).not.toContain(
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

    expect(messages.richMarkdown).toContain(
      "_Can't fetch currency from crypto_",
    )
    expect(messages.text).toContain('Can&apos;t fetch currency from crypto')
  })
})
