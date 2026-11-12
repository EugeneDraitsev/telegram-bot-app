import {
  WIDGET_MAX_COMPRESSED_BYTES,
  widgetCompressedSize,
} from '@tg-bot/common'
import type { CurrencyHistoryDay, CurrencySnapshot } from '../types'
import { buildCurrencyWidgetHtml } from '../widget'

const NOW: CurrencySnapshot = {
  rates: { USD: 1.25, BYN: 3.5, SEK: 11.25, PLN: 4.5, UAH: 50, RUB: 100 },
  prices: { BTC: 73498.7, ETH: 2050.126, ADA: 0.17349, BRENT: 93.27 },
}

const HISTORY: CurrencyHistoryDay[] = [
  {
    date: '2026-10-31',
    rates: { USD: 1.1, BYN: 3.3, SEK: 11, PLN: 4.4, UAH: 49.5, RUB: 88 },
    prices: { BTC: 70000, ETH: 2000, ADA: 0.2, BRENT: 90 },
  },
  {
    date: '2026-11-01',
    rates: { USD: 1.1, BYN: 3.41, SEK: 11.11, PLN: 4.51, UAH: 50.6, RUB: 99 },
    prices: { BTC: 71000, ETH: 2100, ADA: 0.19, BRENT: 91 },
  },
]

/** A week of rates that never repeat a digit pattern, like real ones. */
function noisyWeek(): { now: CurrencySnapshot; history: CurrencyHistoryDay[] } {
  let seed = 7
  const noise = () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
  const snapshot = (): CurrencySnapshot => ({
    rates: {
      USD: 1.1 + noise() / 10,
      BYN: 3.3 + noise() / 10,
      SEK: 11 + noise(),
      PLN: 4.4 + noise() / 10,
      UAH: 50 + noise(),
      RUB: 92 + noise() * 3,
    },
    prices: {
      BTC: 100000 + noise() * 9000,
      ETH: 2000 + noise() * 900,
      ADA: 0.17 + noise() / 10,
      BRENT: 93 + noise() * 9,
    },
  })

  return {
    now: snapshot(),
    history: Array.from({ length: 7 }, (_, index) => ({
      date: `2026-11-${10 + index}`,
      ...snapshot(),
    })),
  }
}

describe('currency widget', () => {
  test('stays within the Telegram widget size limits', () => {
    const { now, history } = noisyWeek()

    const html = buildCurrencyWidgetHtml(now, history) ?? ''

    // Headroom in case Telegram's compressor is a little less tight than ours.
    expect(widgetCompressedSize(html)).toBeLessThanOrEqual(
      WIDGET_MAX_COMPRESSED_BYTES - 96,
    )
  })

  test('gives every rate its value and its history', () => {
    const html = buildCurrencyWidgetHtml(NOW, HISTORY)

    expect(html).toContain('const L=["31 окт","1 ноя"],Q=')
    // A dollar pair divides by the dollar rate; a fiat chart is history alone.
    expect(html).toContain('Q=[["USD/BYN","",2,2.8,[3,3.1]],')
    expect(html).toContain('["EUR/BYN","",2,3.5,[3.3,3.41]]')
    expect(html).toContain('["USD/RUB","",2,80,[80,90]]')
    expect(html).toContain('["EUR/RUB","",2,100,[88,99]]')
    // A live price ends its own chart.
    expect(html).toContain('["Brent","$",2,93.27,[90,91,93.27]]')
    expect(html).toContain('["BTC","$",0,73499,[70000,71000,73499]]')
    expect(html).toContain('["ETH","$",0,2050,[2000,2100,2050]]')
    // A fraction keeps one digit past the shown ones.
    expect(html).toContain('["ADA","$",3,0.1735,[0.2,0.19,0.1735]]')
  })

  test('lays the rates out like the image reply, on one screen', () => {
    const html = buildCurrencyWidgetHtml(NOW, HISTORY) ?? ''

    // The main pairs sit under the USD and EUR columns, behind a drawn flag,
    // and every value has its sparkline right after it.
    expect(html).toContain(
      '<div class="th"><span>USD</span><span>EUR</span></div><div class="tr m"><div class="lb"><i class="f BYN"><i></i></i>BYN</div><div class="c" id="c0"><span></span><svg width="38" height="20">',
    )
    expect(html).toContain('<i class="f UAH"><i></i></i>UAH</div>')
    expect(html).toContain(
      '<div class="tr"><div class="lb">USD/RUB</div><div class="c" id="c8"><span></span><svg width="38" height="20">',
    )
    expect(html).toContain(
      '<div class="tr"><div class="lb"><i>🛢️</i>Brent</div><div class="c" id="c10">',
    )
    expect(html).toContain(
      '<div class="tr"><div class="lb">ADA</div><div class="c" id="c13">',
    )
    expect(html.split('<div class="hr"></div>')).toHaveLength(3)
  })

  test('keeps the big chart closed until a rate is tapped', () => {
    const html = buildCurrencyWidgetHtml(NOW, HISTORY)

    expect(html).toContain('<div class="ov" id="ov">')
    expect(html).toContain('transform:translateY(105%)')
    expect(html).toContain("ov.className='ov on'")
  })

  test('sizes the chart panel to cover the table exactly', () => {
    const html = buildCurrencyWidgetHtml(NOW, HISTORY)

    // A 16px header, ten 30px rows and two 11px separators, less the 106px
    // of the panel around the chart.
    expect(html).toContain('<div id="pl" style="height:232px">')
    expect(html).toContain(',H=232\n')
    // Nothing in the layout depends on aspect-ratio, which Telegram ignored.
    expect(html).not.toContain('aspect-ratio')
  })

  test('leaves out a rate without a live value or a full history', () => {
    const html = buildCurrencyWidgetHtml(
      { ...NOW, prices: { ...NOW.prices, ETH: undefined } },
      [
        HISTORY[0],
        { ...HISTORY[1], prices: { ...HISTORY[1].prices, BRENT: undefined } },
      ],
    )

    expect(html).not.toContain('ETH')
    expect(html).not.toContain('Brent')
    // The cells that are left stay numbered in a row, as the quotes are.
    expect(html).toContain(
      '<div class="tr"><div class="lb">BTC</div><div class="c" id="c10">',
    )
    expect(html).toContain(
      '<div class="tr"><div class="lb">ADA</div><div class="c" id="c11">',
    )
    expect(html).toContain('["ADA","$",3,0.1735,[0.2,0.19,0.1735]]],H=172\n')
    // The panel follows the shorter table: eight rows are left.
    expect(html).toContain('<div id="pl" style="height:172px">')
  })

  test('drops a group that has no rates left', () => {
    const html = buildCurrencyWidgetHtml({ ...NOW, prices: {} }, HISTORY) ?? ''

    expect(html).toContain('<div class="lb">EUR/RUB</div>')
    expect(html).not.toContain('BTC')
    expect(html.split('<div class="hr"></div>')).toHaveLength(2)
  })

  test('is not built without a history to draw', () => {
    expect(buildCurrencyWidgetHtml(NOW, HISTORY.slice(0, 1))).toBeUndefined()
    expect(
      buildCurrencyWidgetHtml(
        { rates: {}, prices: {} },
        HISTORY.map((day) => ({ ...day, rates: {}, prices: {} })),
      ),
    ).toBeUndefined()
  })
})
