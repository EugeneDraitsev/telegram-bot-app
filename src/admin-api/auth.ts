import { createRemoteJWKSet, type JWTPayload, jwtVerify, SignJWT } from 'jose'

import { getRequiredEnv, isBotOwner } from '@tg-bot/common'

const TELEGRAM_ISSUER = 'https://oauth.telegram.org'
const TELEGRAM_JWKS_URL = new URL(
  'https://oauth.telegram.org/.well-known/jwks.json',
)
const ADMIN_SESSION_ISSUER = 'telegram-bot-admin'
const ADMIN_SESSION_AUDIENCE = 'telegram-bot-admin-api'
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12

const telegramJwks = createRemoteJWKSet(TELEGRAM_JWKS_URL)

export interface AdminIdentity {
  id: string
  name?: string
  username?: string
  picture?: string
}

export class AdminAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: 401 | 403 = 401,
  ) {
    super(message)
    this.name = 'AdminAuthError'
  }
}

function getAdminSessionSecret(): Uint8Array {
  const secret = getRequiredEnv('ADMIN_SESSION_SECRET')
  if (secret.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters')
  }
  return new TextEncoder().encode(secret)
}

function getTelegramUserId(payload: JWTPayload): string | undefined {
  if (typeof payload.id === 'number' || typeof payload.id === 'string') {
    return String(payload.id)
  }
  return typeof payload.sub === 'string' ? payload.sub : undefined
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function getIdentity(payload: JWTPayload): AdminIdentity {
  const id = getTelegramUserId(payload)
  if (!id || !isBotOwner(id)) {
    throw new AdminAuthError('This Telegram account is not allowed', 403)
  }

  return {
    id,
    name: getOptionalString(payload.name),
    username: getOptionalString(payload.preferred_username),
    picture: getOptionalString(payload.picture),
  }
}

export async function createAdminSessionFromTelegram(
  idToken: string,
  nonce: string,
): Promise<{ token: string; identity: AdminIdentity }> {
  if (!idToken || !nonce) {
    throw new AdminAuthError('Telegram login data is incomplete')
  }

  let payload: JWTPayload
  try {
    const verified = await jwtVerify(idToken, telegramJwks, {
      issuer: TELEGRAM_ISSUER,
      audience: getRequiredEnv('TELEGRAM_OIDC_CLIENT_ID'),
      algorithms: ['RS256', 'ES256', 'EdDSA', 'ES256K'],
    })
    payload = verified.payload
  } catch {
    throw new AdminAuthError('Telegram identity token is invalid')
  }

  if (payload.nonce !== nonce) {
    throw new AdminAuthError('Telegram login nonce is invalid')
  }

  const identity = getIdentity(payload)
  const token = await new SignJWT({
    name: identity.name,
    username: identity.username,
    picture: identity.picture,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(ADMIN_SESSION_ISSUER)
    .setAudience(ADMIN_SESSION_AUDIENCE)
    .setSubject(identity.id)
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_TTL_SECONDS}s`)
    .sign(getAdminSessionSecret())

  return { token, identity }
}

export async function verifyAdminSession(
  token: string,
): Promise<AdminIdentity> {
  const secret = getAdminSessionSecret()
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: ADMIN_SESSION_ISSUER,
      audience: ADMIN_SESSION_AUDIENCE,
      algorithms: ['HS256'],
    })
    return getIdentity(payload)
  } catch (error) {
    if (error instanceof AdminAuthError) {
      throw error
    }
    throw new AdminAuthError('Admin session is invalid')
  }
}
