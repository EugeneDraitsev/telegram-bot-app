import { buildCurrencyMessages } from '../format'

const byn = '\u{1F1E7}\u{1F1FE}BYN'
const sek = '\u{1F1F8}\u{1F1EA}SEK'
const pln = '\u{1F1F5}\u{1F1F1}PLN'
const uah = '\u{1F1FA}\u{1F1E6}UAH'
const barrel = '\u{1F6E2}'

function getPreBlocks(html: string) {
  const blocks: string[] = []

  for (const match of html.matchAll(/<pre>([\s\S]*?)<\/pre>/g)) {
    blocks.push(match[1] ?? '')
  }

  return blocks
}

function visibleWidth(value: string) {
  let width = 0

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0

    if (
      codePoint === 0x200b ||
      codePoint === 0x200d ||
      (codePoint >= 0xfe00 && codePoint <= 0xfe0f) ||
      (codePoint >= 0x0300 && codePoint <= 0x036f)
    ) {
      continue
    }

    if (codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff) {
      width += 1
      continue
    }

    width += codePoint >= 0x1f300 && codePoint <= 0x1faff ? 2 : 1
  }

  return width
}

function visualColumn(line: string, value: string) {
  const index = line.indexOf(value)

  expect(index).toBeGreaterThanOrEqual(0)

  return visibleWidth(line.slice(0, index))
}

function visualRightEdge(line: string, value: string) {
  return visualColumn(line, value) + visibleWidth(value)
}

function expectSameVisualRightEdge(lines: string[], values: string[]) {
  expect(lines).toHaveLength(values.length)

  const columns = values.map((value, index) =>
    visualRightEdge(lines[index] ?? '', value),
  )

  expect(new Set(columns).size).toBe(1)

  return columns[0]
}

describe('currency rich formatting', () => {
  test('builds preformatted rich blocks and compact HTML fallback', () => {
    const messages = buildCurrencyMessages([
      {
        title: 'Main pairs',
        provider: 'ExchangeRate',
        columns: ['', 'USD', 'EUR'],
        rows: [
          { label: byn, values: ['2.85', '3.31'] },
          { label: sek, values: ['9.57', '10.98'] },
          { label: pln, values: ['3.71', '4.26'] },
          { label: uah, values: ['44.96', '51.48'] },
        ],
        note: 'BYN uses BSB cash sell rates when available.',
      },
      {
        title: 'Ruble and oil',
        provider: 'ExchangeRate',
        rows: [
          { label: 'USD/RUB', value: '$73.36' },
          { label: 'EUR/RUB', value: '$84.15' },
          { label: `${barrel}Brent`, value: '$79.58' },
        ],
      },
      {
        title: 'Crypto',
        provider: 'OKX',
        columns: ['Coin', 'Price / 24h'],
        rows: [
          { label: 'BTC', value: '$62 523.8 (-2.47%)' },
          { label: 'ETH', value: '$1 692.52 (-3.18%)' },
          { label: 'ADA', value: '$0.17 (-4.07%)' },
        ],
      },
    ])

    expect(messages.richMessage).toEqual(
      expect.objectContaining({ skip_entity_detection: true }),
    )
    expect(messages.sections).toHaveLength(3)
    const html = messages.richMessage.html ?? ''
    expect(html).not.toContain('Courses')
    expect(html).toContain('<b>Main pairs (ExchangeRate)</b>')
    expect(html).toContain('<pre>')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('|')
    expect(html).not.toMatch(/^\+/m)
    expect(html).toMatch(/ADA\s+\$0\.17 \(-4\.07%\)/)
    expect(html).not.toContain('<th>')
    expect(html).not.toContain('Coin')
    expect(html).not.toContain('BYN uses BSB cash sell rates when available.')

    const blocks = getPreBlocks(html)
    expect(blocks).toHaveLength(3)
    const mainBlock = blocks[0] ?? ''
    const rubleBlock = blocks[1] ?? ''
    const cryptoBlock = blocks[2] ?? ''

    const mainLines = mainBlock.split('\n')
    expect(mainLines).toEqual([
      `-${' '.repeat(10)}USD     EUR`,
      `${byn.replace('BYN', ' BYN')}    2.85    3.31`,
      `${sek.replace('SEK', ' SEK')}    9.57   10.98`,
      `${pln.replace('PLN', ' PLN')}    3.71    4.26`,
      `${uah.replace('UAH', ' UAH')}   44.96   51.48`,
    ])
    expectSameVisualRightEdge(mainLines, [
      'USD',
      '2.85',
      '9.57',
      '3.71',
      '44.96',
    ])
    expectSameVisualRightEdge(mainLines, [
      'EUR',
      '3.31',
      '10.98',
      '4.26',
      '51.48',
    ])

    const rubleLines = rubleBlock.split('\n')
    expect(rubleLines[2]).toContain(`${barrel} Brent`)
    expect(rubleLines).toEqual([
      'USD/RUB    $73.36',
      'EUR/RUB    $84.15',
      `${barrel} Brent   $79.58`,
    ])
    expectSameVisualRightEdge(rubleLines, ['$73.36', '$84.15', '$79.58'])

    expectSameVisualRightEdge(cryptoBlock.split('\n'), [
      '$62 523.8 (-2.47%)',
      '$1 692.52 (-3.18%)',
      '$0.17 (-4.07%)',
    ])

    expect(messages.text).toContain('<b>Main pairs (ExchangeRate):</b>')
    expect(messages.text).toContain(
      '\u{1F1E7}\u{1F1FE} BYN: USD 2.85, EUR 3.31',
    )
    expect(messages.text).toContain(
      '\u{1F1F8}\u{1F1EA} SEK: USD 9.57, EUR 10.98',
    )
    expect(messages.text).toContain(
      '\u{1F1FA}\u{1F1E6} UAH: USD 44.96, EUR 51.48',
    )
    expect(messages.text).toContain(`${barrel} Brent: $79.58`)
    expect(messages.text).toContain('<b>Crypto (OKX):</b>')
    expect(messages.text).toContain('ADA: $0.17 (-4.07%)')
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
