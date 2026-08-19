import { SignJWT } from 'jose'

import { createAdminSessionFromTelegram, verifyAdminSession } from '../auth'

const originalOwnerId = process.env.BOT_OWNER_ID
const originalSessionSecret = process.env.ADMIN_SESSION_SECRET

beforeEach(() => {
  process.env.BOT_OWNER_ID = '42'
  process.env.ADMIN_SESSION_SECRET = 'x'.repeat(48)
})

afterAll(() => {
  if (originalOwnerId === undefined) delete process.env.BOT_OWNER_ID
  else process.env.BOT_OWNER_ID = originalOwnerId
  if (originalSessionSecret === undefined) {
    delete process.env.ADMIN_SESSION_SECRET
  } else {
    process.env.ADMIN_SESSION_SECRET = originalSessionSecret
  }
})

describe('admin session verification', () => {
  test('rejects missing Telegram login data before remote verification', async () => {
    await expect(createAdminSessionFromTelegram('', '')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  test('rejects malformed admin sessions', async () => {
    await expect(verifyAdminSession('not-a-jwt')).rejects.toMatchObject({
      statusCode: 401,
    })
  })

  test('does not mask invalid session secret configuration as a 401', async () => {
    process.env.ADMIN_SESSION_SECRET = 'too-short'

    await expect(verifyAdminSession('not-a-jwt')).rejects.toMatchObject({
      name: 'Error',
      message: 'ADMIN_SESSION_SECRET must contain at least 32 characters',
    })
  })

  test('accepts a valid session only for the current bot owner', async () => {
    const secret = new TextEncoder().encode(
      process.env.ADMIN_SESSION_SECRET ?? '',
    )
    const token = await new SignJWT({ name: 'Owner' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('telegram-bot-admin')
      .setAudience('telegram-bot-admin-api')
      .setSubject('42')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret)

    await expect(verifyAdminSession(token)).resolves.toEqual({
      id: '42',
      name: 'Owner',
      username: undefined,
      picture: undefined,
    })

    process.env.BOT_OWNER_ID = '43'
    await expect(verifyAdminSession(token)).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})
