import { timingSafeEqual } from 'node:crypto'

const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'

type WebhookHeaders = Record<string, string | undefined> | null | undefined

export function hasValidTelegramWebhookSecret(
  headers: WebhookHeaders,
  expectedSecret: string | undefined,
): boolean {
  if (!expectedSecret) {
    return false
  }

  const receivedSecret = Object.entries(headers ?? {}).find(
    ([name]) => name.toLowerCase() === TELEGRAM_SECRET_HEADER,
  )?.[1]

  if (typeof receivedSecret !== 'string') {
    return false
  }

  const received = Buffer.from(receivedSecret)
  const expected = Buffer.from(expectedSecret)
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  )
}
