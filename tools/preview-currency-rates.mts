import { writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CurrencyRateSection } from '../src/common/types/currency.js'
import { getCurrencyRatesSvg } from '../src/sharp-statistics/currency-rates.component.js'

type SharpFactory = (input: Buffer) => {
  png: () => {
    toFile: (outputPath: string) => Promise<unknown>
  }
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const requireFromSharpStatistics = createRequire(
  path.join(rootDir, 'src', 'sharp-statistics', 'package.json'),
)
const sharp = requireFromSharpStatistics('sharp') as SharpFactory

const byn = '\u{1F1E7}\u{1F1FE}BYN'
const sek = '\u{1F1F8}\u{1F1EA}SEK'
const pln = '\u{1F1F5}\u{1F1F1}PLN'
const uah = '\u{1F1FA}\u{1F1E6}UAH'
const oil = '\u{1F6E2}\uFE0FBrent'

const sections: CurrencyRateSection[] = [
  {
    title: '\u041e\u0441\u043d\u043e\u0432\u043d\u044b\u0435 \u043f\u0430\u0440\u044b',
    provider: 'ExchangeRate',
    columns: ['', 'USD', 'EUR'],
    rows: [
      { label: byn, values: ['2.85', '3.31'] },
      { label: sek, values: ['9.57', '10.98'] },
      { label: pln, values: ['3.71', '4.26'] },
      { label: uah, values: ['44.97', '51.59'] },
    ],
  },
  {
    title:
      '\u0420\u0443\u0431\u043b\u044c \u0438 \u043d\u0435\u0444\u0442\u044c',
    provider: 'ExchangeRate',
    rows: [
      { label: 'USD/RUB', value: '$73.36' },
      { label: 'EUR/RUB', value: '$84.15' },
      { label: oil, value: '$79.37' },
    ],
  },
  {
    title: '\u041a\u0440\u0438\u043f\u0442\u0430',
    provider: 'OKX',
    rows: [
      { label: 'BTC', value: '$62 353.8 (-2.93%)' },
      { label: 'ETH', value: '$1 689.39 (-3.32%)' },
      { label: 'ADA', value: '$0.16 (-4.55%)' },
    ],
  },
]

const outputPath = path.resolve(
  process.argv[2] ??
    path.join(tmpdir(), `currency-rates-preview-${Date.now()}.png`),
)
const svgPath = outputPath.replace(/\.png$/i, '.svg')
const svg = getCurrencyRatesSvg(sections)

await writeFile(svgPath, svg, 'utf8')
await sharp(Buffer.from(svg)).png().toFile(outputPath)

console.log(outputPath)
