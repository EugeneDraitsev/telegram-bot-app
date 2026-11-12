import {
  fitsWidgetLimits,
  type UserStat,
  widgetCompressedSize,
} from '@tg-bot/common'
import { buildStatisticsWidgetHtml } from '../statistics-widget'

const makeUsers = (
  counts: number[],
  name = (index: number) => `user${index}`,
) =>
  counts.map(
    (msgCount, index): UserStat => ({
      id: index,
      msgCount,
      username: name(index),
    }),
  )

/** The [name, count] rows the widget script pages through. */
const listedRows = (html: string): Array<[string, number]> =>
  JSON.parse(html.match(/const U=(\[.*?\]),N=/)?.[1] ?? 'null')

describe('statistics widget', () => {
  test('puts the top three on a podium and lists everyone else', () => {
    const html = buildStatisticsWidgetHtml(
      makeUsers([500, 200, 100, 80, 50, 30, 20, 8, 4, 3, 3, 2]),
    )

    expect(html).toContain('Chat statistics · 12 users')
    expect(html).toContain('<b id="tot">1,000</b>messages')
    // Second place stands left of the winner, third on the right.
    expect(html.indexOf('🥈')).toBeLessThan(html.indexOf('🥇'))
    expect(html.indexOf('🥇')).toBeLessThan(html.indexOf('🥉'))
    expect(html).toContain('<small>500 · 50%</small><i id="s0"')
    expect(listedRows(html)).toEqual([
      ['user3', 80],
      ['user4', 50],
      ['user5', 30],
      ['user6', 20],
      ['user7', 8],
      ['user8', 4],
      ['user9', 3],
      ['user10', 3],
      ['user11', 2],
    ])
    expect(html).toContain('N=1000,M=500,C=12')
    // Nine rows need a second page; the box stays seven rows tall.
    expect(html).toContain('<div id="rows" style="height:238px"></div>')
    expect(html).toContain('<button id="nx">')
  })

  test('shows no pager when the list fits on one page', () => {
    const html = buildStatisticsWidgetHtml(makeUsers([9, 8, 7, 6, 5]))

    expect(listedRows(html)).toHaveLength(2)
    expect(html).toContain('<div id="rows" style="height:68px"></div>')
    expect(html).not.toContain('<button')
  })

  test('works for a private chat with a single user', () => {
    const html = buildStatisticsWidgetHtml(makeUsers([42]))

    expect(html).toContain('Chat statistics · 1 user<')
    expect(html).toContain('🥇')
    expect(html).not.toContain('🥈')
    expect(html).not.toContain('id="rows"')
    expect(html).toContain('const U=[],N=42,M=42,C=1')
  })

  test('cuts a big chat from the tail until it fits the size limits', () => {
    // Random 40-letter Cyrillic names barely compress, unlike repeated text.
    let seed = 7
    const randomName = () =>
      Array.from({ length: 40 }, () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
        return String.fromCharCode(0x430 + ((seed >>> 16) % 32))
      }).join('')
    const users = makeUsers(
      Array.from({ length: 200 }, (_, index) => 987_654_321 - index * 7919),
      randomName,
    )

    const html = buildStatisticsWidgetHtml(users)
    const rows = listedRows(html)

    expect(fitsWidgetLimits(html)).toBe(true)
    expect(widgetCompressedSize(html)).toBeLessThanOrEqual(4_000)
    expect(rows.length).toBeGreaterThanOrEqual(7)
    expect(rows.length).toBeLessThan(97)
    expect(rows[0][0]).toHaveLength(32)
    expect(html).toContain('C=200')
  })

  test('lists a chat of ordinary names in full', () => {
    const html = buildStatisticsWidgetHtml(
      makeUsers(
        Array.from({ length: 60 }, (_, index) => 90_000 - index * 1_371),
        (index) => `member_${(index * 7919) % 1000}`,
      ),
    )

    expect(fitsWidgetLimits(html)).toBe(true)
    expect(listedRows(html)).toHaveLength(57)
  })

  test('escapes user names in the podium and in the row data', () => {
    const html = buildStatisticsWidgetHtml(
      makeUsers([4, 3, 2, 1], () => '</script><b>'),
    )

    expect(html).toContain('&lt;/script&gt;&lt;b&gt;')
    expect(html).not.toContain('</script><b>')
    expect(listedRows(html)).toEqual([['</script><b>', 1]])
  })
})
