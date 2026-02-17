import type { Message } from 'telegram-typings'

export interface BotIdentity {
  id?: number
  username?: string
}

const TELEGRAM_MENTION_REGEX = /@([A-Za-z0-9_]{3,})/g
const BOT_WORD_REGEX =
  /(^|[^A-Za-z\u0400-\u04FF0-9_])(\u0431\u043e\u0442(?:\u0438\u043a)?|bot)(?=[^A-Za-z\u0400-\u04FF0-9_]|$)/i

const REQUEST_MARKERS = [
  '?',
  'please',
  'pls',
  'help',
  'answer',
  'respond',
  'tell me',
  'show me',
  'can you',
  'could you',
  'would you',
  '\u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430',
  '\u043f\u0436',
  '\u043e\u0442\u0432\u0435\u0442\u044c',
  '\u043f\u043e\u0434\u0441\u043a\u0430\u0436\u0438',
  '\u0441\u043a\u0430\u0436\u0438',
  '\u043f\u043e\u043c\u043e\u0433\u0438',
  '\u043e\u0431\u044a\u044f\u0441\u043d\u0438',
  '\u0440\u0430\u0441\u0441\u043a\u0430\u0436\u0438',
  '\u0434\u0430\u0439',
  '\u043f\u043e\u043a\u0430\u0436\u0438',
  '\u0441\u0434\u0435\u043b\u0430\u0439',
  '\u043f\u0440\u043e\u0432\u0435\u0440\u044c',
  '\u043d\u0430\u043f\u0438\u0448\u0438',
]

function normalizeMention(value?: string): string {
  return (value || '').replace(/^@/, '').trim().toLowerCase()
}

export function extractMentions(text: string): string[] {
  if (!text) {
    return []
  }

  const mentions = new Set<string>()
  for (const match of text.matchAll(TELEGRAM_MENTION_REGEX)) {
    const username = normalizeMention(match[1])
    if (username) {
      mentions.add(username)
    }
  }

  return [...mentions]
}

export function mentionsOurBot(text: string, ourBotUsername?: string): boolean {
  const normalizedOurUsername = normalizeMention(ourBotUsername)
  if (!normalizedOurUsername) {
    return false
  }

  return extractMentions(text).includes(normalizedOurUsername)
}

export function mentionsAnotherAccount(
  text: string,
  ourBotUsername?: string,
): boolean {
  const normalizedOurUsername = normalizeMention(ourBotUsername)
  return extractMentions(text).some(
    (mention) => mention !== normalizedOurUsername,
  )
}

export function hasBotAddressSignal(
  text: string,
  ourBotUsername?: string,
): boolean {
  return mentionsOurBot(text, ourBotUsername) || BOT_WORD_REGEX.test(text)
}

export function hasExplicitRequestSignal(text: string): boolean {
  if (!text?.trim()) {
    return false
  }

  const normalizedText = text.toLowerCase()
  return REQUEST_MARKERS.some((marker) => normalizedText.includes(marker))
}

export function isReplyToOurBot(message: Message, botId?: number): boolean {
  const replyFrom = message.reply_to_message?.from
  return Boolean(replyFrom?.is_bot && botId && replyFrom.id === botId)
}

export function isReplyToAnotherBot(message: Message, botId?: number): boolean {
  const replyFrom = message.reply_to_message?.from
  return Boolean(replyFrom?.is_bot && (!botId || replyFrom.id !== botId))
}

export function hasDirectRequestToBot(params: {
  text: string
  isReplyToOurBot: boolean
  ourBotUsername?: string
}): boolean {
  const { text, isReplyToOurBot, ourBotUsername } = params
  if (!hasExplicitRequestSignal(text)) {
    return false
  }

  return isReplyToOurBot || hasBotAddressSignal(text, ourBotUsername)
}
