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

  test('does not render vertical table separators', () => {
    const svg = getCurrencyRatesSvg([
      {
        title: 'Main pairs',
        provider: 'ExchangeRate',
        columns: ['', 'USD', 'EUR'],
        rows: [
          { label: 'BYN', values: ['2.85', '3.31'] },
          { label: 'UAH', values: ['44.96', '51.48'] },
        ],
      },
    ])
    const lines = Array.from(svg.matchAll(/<line\b[^>]*>/g), ([line]) => line)
    const verticalLines = lines.filter((line) => {
      const x1 = line.match(/\sx1="([^"]+)"/)?.[1]
      const x2 = line.match(/\sx2="([^"]+)"/)?.[1]
      const y1 = line.match(/\sy1="([^"]+)"/)?.[1]
      const y2 = line.match(/\sy2="([^"]+)"/)?.[1]

      return x1 === x2 && y1 !== y2
    })

    expect(verticalLines).toEqual([])
  })

  test('renders a generated background image data uri', async () => {
    const backgroundImage = (
      await sharp({
        create: {
          width: 2,
          height: 2,
          channels: 4,
          background: '#123456',
        },
      })
        .jpeg()
        .toBuffer()
    ).toString('base64')
    const svg = getCurrencyRatesSvg(
      [
        {
          title: 'Main pairs',
          provider: 'ExchangeRate',
          rows: [{ label: 'BYN', value: '3.31' }],
        },
      ],
      backgroundImage,
    )

    expect(svg).toContain('data:image/jpeg;base64')
    expect(svg).toContain('background-overlay')

    const image = await sharp(Buffer.from(svg)).png().toBuffer()

    expect(image.length).toBeGreaterThan(0)
  })
})
