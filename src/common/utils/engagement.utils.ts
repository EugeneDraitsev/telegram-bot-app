import type { Message } from 'telegram-typings'

export interface BotIdentity {
  id?: number
  username?: string
}

const TELEGRAM_MENTION_REGEX = /@([A-Za-z0-9_]{3,})/g
const BOT_WORD_REGEX =
  /(^|[^A-Za-z\u0400-\u04FF0-9_])(\u0431\u043e\u0442(?:\u0438\u043a)?|bot)(?=[^A-Za-z\u0400-\u04FF0-9_]|$)/i

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

export function isReplyToOurBot(message: Message, botId?: number): boolean {
  const replyFrom = message.reply_to_message?.from
  return Boolean(replyFrom?.is_bot && botId && replyFrom.id === botId)
}

export function isReplyToAnotherBot(message: Message, botId?: number): boolean {
  const replyFrom = message.reply_to_message?.from
  if (!replyFrom?.is_bot) {
    return false
  }

  // If bot identity is unknown, we cannot reliably classify "another" bot.
  // Let higher-level logic decide based on mentions/request signals.
  if (!botId) {
    return false
  }

  return replyFrom.id !== botId
}
