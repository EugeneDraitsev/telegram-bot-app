import { buildFormattedChatStatisticsMessages } from '../chat-statistics'

describe('buildFormattedChatStatisticsMessages', () => {
  test('builds plain fallback text and rich markdown table from the same stats', () => {
    const result = buildFormattedChatStatisticsMessages([
      { id: 1, username: 'alice', msgCount: 10 },
      { id: 2, username: 'bo|b', msgCount: 30 },
    ])

    expect(result.text).toContain('All messages: 40')
    expect(result.text).toContain('30 (75.00%) - bo|b')
    expect(result.text).toContain('10 (25.00%) - alice')

    expect(result.richMarkdown).toContain('# Users Statistic')
    expect(result.richMarkdown).toContain('| User | Messages | Share |')
    expect(result.richMarkdown).toContain('| bo\\|b | 30 | 75.00% |')
    expect(result.richMarkdown).toContain('| alice | 10 | 25.00% |')
    expect(result.richMarkdown).not.toContain('| # |')
  })

  test('caps rich table rows while preserving full fallback text', () => {
    const result = buildFormattedChatStatisticsMessages(
      Array.from({ length: 101 }, (_, index) => ({
        id: index,
        username: `user${index}`,
        msgCount: 101 - index,
      })),
    )

    expect(result.richMarkdown).toContain('Showing top 100 of 101 users.')
    expect(result.richMarkdown).not.toContain('user100')
    expect(result.text).toContain('1 (0.02%) - user100')
  })
})
