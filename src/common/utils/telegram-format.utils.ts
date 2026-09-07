import telegramifyMarkdown from 'telegramify-markdown'

/** Normalize model bullet lines into real Markdown lists for both renderers. */
export const normalizeTelegramMarkdown = (input: string): string => {
  let fence: string | undefined
  return input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
      if (marker) {
        if (!fence) fence = marker[1]
        else if (
          marker[1]?.[0] === fence[0] &&
          marker[1].length >= fence.length &&
          !marker[2]?.trim()
        ) {
          fence = undefined
        }
        return line
      }
      return fence ? line : line.replace(/^(\s*)[•●▪][ \t]+/, '$1- ')
    })
    .join('\n')
}

/** Converts regular Markdown to Telegram MarkdownV2. */
export const formatTelegramMarkdownV2 = (input: string) => {
  if (!input) return ''
  return telegramifyMarkdown(normalizeTelegramMarkdown(input), 'escape')
}
