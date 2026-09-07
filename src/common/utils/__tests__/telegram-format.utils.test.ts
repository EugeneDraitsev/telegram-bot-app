import {
  formatTelegramMarkdownV2,
  normalizeTelegramMarkdown,
} from '../telegram-format.utils'

describe('Telegram Markdown formatting', () => {
  test('keeps the screenshot-style list and emphasis in both delivery formats', () => {
    const input =
      '**Вывод:** меньше зло\r\n\r\n• **Когда:** с 1990-х\r\n• **Зачем:** тепло\r\n\r\n*Итог*'
    expect(normalizeTelegramMarkdown(input)).toBe(
      '**Вывод:** меньше зло\n\n- **Когда:** с 1990-х\n- **Зачем:** тепло\n\n*Итог*',
    )
    const fallback = formatTelegramMarkdownV2(input)
    expect(fallback).toContain('*Вывод:*')
    expect(fallback).toMatch(/•\s+\*Когда:\*/)
    expect(fallback).toMatch(/\n•\s+\*Зачем:\*/)
    expect(fallback).toContain('_Итог_')
  })

  test('preserves fenced code and inline bullet symbols', () => {
    const code =
      '````text\n• literal\n```\n• still literal\n````\n\n~~~\n• literal\n~~~'
    expect(normalizeTelegramMarkdown(code)).toBe(code)
    expect(normalizeTelegramMarkdown('a • b\n• item')).toBe('a • b\n- item')
  })

  test('preserves existing Markdown and normalizes nested bullet markers', () => {
    expect(
      normalizeTelegramMarkdown(
        '- Parent\n  ▪ Child\n\n1. Numbered\n2. Second',
      ),
    ).toBe('- Parent\n  - Child\n\n1. Numbered\n2. Second')
  })
})
