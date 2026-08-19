import { createHmac, timingSafeEqual } from 'node:crypto'

import { FRONTEND_BASE_URL } from '../constants'
import { getOptionalEnv, getRequiredEnv } from './env.utils'

const TOKEN_VERSION = 'v1'
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
const SIGNING_CONTEXT = 'telegram-statistics-access'

const getAccessSecret = () =>
  getOptionalEnv('STATISTICS_ACCESS_SECRET') ??
  getRequiredEnv('TELEGRAM_WEBHOOK_SECRET')

const sign = (chatId: string, expiresAt: number) =>
  createHmac('sha256', getAccessSecret())
    .update(`${SIGNING_CONTEXT}:${TOKEN_VERSION}:${chatId}:${expiresAt}`)
    .digest()

export function createStatisticsAccessToken(
  chatId: string | number,
  now = Date.now(),
  ttlSeconds = TOKEN_TTL_SECONDS,
): string {
  const normalizedChatId = String(chatId)
  const expiresAt = Math.floor(now / 1000) + ttlSeconds
  const signature = sign(normalizedChatId, expiresAt).toString('base64url')

  return `${TOKEN_VERSION}.${expiresAt}.${signature}`
}

export function verifyStatisticsAccessToken(
  chatId: string | number,
  token: unknown,
  now = Date.now(),
): boolean {
  if (typeof token !== 'string') {
    return false
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    return false
  }

  const [version, expiresAtText, signatureText] = parts
  const expiresAt = Number(expiresAtText)
  if (
    version !== TOKEN_VERSION ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000)
  ) {
    return false
  }

  const expected = sign(String(chatId), expiresAt)
  const provided = Buffer.from(signatureText, 'base64url')

  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  )
}

export function getChatStatisticsUrl(chatId: string | number): string {
  const url = new URL(
    `/chat/${encodeURIComponent(String(chatId))}`,
    FRONTEND_BASE_URL,
  )
  url.searchParams.set('access', createStatisticsAccessToken(chatId))
  return url.toString()
}
