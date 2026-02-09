import telegramifyMarkdown from 'telegramify-markdown'

/**
 * Converts regular Markdown to Telegram MarkdownV2.
 * We trust model output and only normalize line endings before conversion.
 */
export const formatTelegramMarkdownV2 = (input: string) => {
  if (!input) return ''

  const normalized = input.replace(/\r\n?/g, '\n')
  return telegramifyMarkdown(normalized, 'escape')
}
