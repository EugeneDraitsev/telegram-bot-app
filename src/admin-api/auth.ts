import { createRemoteJWKSet, type JWTPayload, jwtVerify, SignJWT } from 'jose'

import { getRequiredEnv } from '@tg-bot/common'

const TELEGRAM_ISSUER = 'https://oauth.telegram.org'
const TELEGRAM_JWKS_URL = new URL(
  'https://oauth.telegram.org/.well-known/jwks.json',
)
// Keep the original values so existing owner sessions survive the rollout to
// a shared Telegram session used by both the dashboard and chat pages.
const SESSION_ISSUER = 'telegram-bot-admin'
const SESSION_AUDIENCE = 'telegram-bot-admin-api'
export const SESSION_TTL_SECONDS = 60 * 60 * 12

const telegramJwks = createRemoteJWKSet(TELEGRAM_JWKS_URL)

export interface SessionIdentity {
  id: string
  name?: string
  username?: string
  picture?: string
}

export class SessionAuthError extends Error {
  constructor(
    message: string,
    readonly statusCode: 401 | 403 = 401,
  ) {
    super(message)
    this.name = 'SessionAuthError'
  }
}

function getSessionSecret(): Uint8Array {
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

function getIdentity(payload: JWTPayload): SessionIdentity {
  const id = getTelegramUserId(payload)
  if (!id) {
    throw new SessionAuthError('Telegram account ID is missing')
  }

  return {
    id,
    name: getOptionalString(payload.name),
    username: getOptionalString(payload.preferred_username),
    picture: getOptionalString(payload.picture),
  }
}

export async function createSessionFromTelegram(
  idToken: string,
  nonce: string,
): Promise<{ token: string; identity: SessionIdentity }> {
  if (!idToken || !nonce) {
    throw new SessionAuthError('Telegram login data is incomplete')
  }

  const clientId = getRequiredEnv('TELEGRAM_OIDC_CLIENT_ID')
  let payload: JWTPayload
  try {
    const verified = await jwtVerify(idToken, telegramJwks, {
      issuer: TELEGRAM_ISSUER,
      audience: clientId,
      algorithms: ['RS256', 'ES256', 'EdDSA', 'ES256K'],
    })
    payload = verified.payload
  } catch {
    throw new SessionAuthError('Telegram identity token is invalid')
  }

  if (payload.nonce !== nonce) {
    throw new SessionAuthError('Telegram login nonce is invalid')
  }

  const identity = getIdentity(payload)
  const token = await new SignJWT({
    name: identity.name,
    username: identity.username,
    picture: identity.picture,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setSubject(identity.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSessionSecret())

  return { token, identity }
}

export async function verifySession(token: string): Promise<SessionIdentity> {
  const secret = getSessionSecret()
  try {
    const { payload } = await jwtVerify(token, secret, {
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      algorithms: ['HS256'],
    })
    return getIdentity(payload)
  } catch (error) {
    if (error instanceof SessionAuthError) {
      throw error
    }
    throw new SessionAuthError('Telegram session is invalid')
  }
}
