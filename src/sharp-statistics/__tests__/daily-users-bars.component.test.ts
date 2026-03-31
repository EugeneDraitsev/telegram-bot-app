import sharp from 'sharp'
import type { User } from 'telegram-typings'

import { getDailyUsersBarsSvg } from '../daily-users-bars.component'

const chartData: Array<User & { messages: number }> = [
  {
    id: 1305082,
    is_bot: false,
    first_name: 'Eugene',
    messages: 12,
  },
  {
    id: 42,
    is_bot: false,
    username: 'octocat',
    first_name: 'Octo',
    messages: 4,
  },
]

describe('getDailyUsersBarsSvg', () => {
  test('returns svg markup that can be converted by sharp', async () => {
    const svg = getDailyUsersBarsSvg(chartData)

    expect(svg).toContain('<svg')
    expect(svg).toContain('All messages: 16')
    expect(svg).toContain('octocat')

    const image = await sharp(Buffer.from(svg)).png().toBuffer()

    expect(image.length).toBeGreaterThan(0)
  })

  test('returns valid empty-state svg for chats without messages', async () => {
    const svg = getDailyUsersBarsSvg([])

    expect(svg).toContain('<svg')
    expect(svg).toContain('All messages: 0')

    const image = await sharp(Buffer.from(svg)).png().toBuffer()

    expect(image.length).toBeGreaterThan(0)
  })
})
