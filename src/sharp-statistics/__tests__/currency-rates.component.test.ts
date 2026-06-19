import sharp from 'sharp'

import { getCurrencyRatesSvg } from '../currency-rates.component'

describe('getCurrencyRatesSvg', () => {
  test('returns svg markup that can be converted by sharp', async () => {
    const oilLabel = '\u{1F6E2}\uFE0FBrent'
    const svg = getCurrencyRatesSvg([
      {
        title: 'Основные пары',
        provider: 'ExchangeRate',
        columns: ['', 'USD', 'EUR'],
        rows: [
          { label: '🇧🇾BYN', values: ['2.85', '3.31'] },
          { label: '🇺🇦UAH', values: ['44.96', '51.48'] },
        ],
      },
      {
        title: 'Крипта',
        provider: 'OKX',
        rows: [
          { label: oilLabel, value: '$79.37' },
          { label: 'BTC', value: '$62 630 (-2.69%)' },
        ],
      },
    ])

    expect(svg).toContain('<svg')
    expect(svg).toContain('width="520"')
    expect(svg).toContain('Основные пары (ExchangeRate)')
    expect(svg).toContain('USD')
    expect(svg).toContain('EUR')
    expect(svg).toContain('UAH')
    expect(svg).toContain('#d91f2d')
    expect(svg).toContain('#b91c1c')
    expect(svg).toContain('#38bdf8')
    expect(svg).not.toContain('#2f9e44')
    expect(svg).not.toContain('#27364a')
    expect(svg).not.toContain('🇧🇾')

    const image = await sharp(Buffer.from(svg)).png().toBuffer()

    expect(image.length).toBeGreaterThan(0)
  })
})
