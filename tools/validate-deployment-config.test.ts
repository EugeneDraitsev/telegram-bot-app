import {
  validateBotOwnerId,
  validateSecret,
  validateTelegramOidcClientId,
} from './validate-deployment-config.mjs'

describe('deployment configuration validation', () => {
  test('accepts a positive numeric Telegram user id', () => {
    expect(validateBotOwnerId('1')).toBe('1')
    expect(validateBotOwnerId(' 42 ')).toBe('42')
  })

  test.each([undefined, '', '0', '-1', 'username', '12.5'])(
    'rejects invalid BOT_OWNER_ID %p',
    (value) => {
      expect(() => validateBotOwnerId(value)).toThrow('BOT_OWNER_ID')
    },
  )

  test('validates the Telegram OIDC client id', () => {
    expect(validateTelegramOidcClientId(' 123 ')).toBe('123')
    expect(() => validateTelegramOidcClientId('client-name')).toThrow(
      'TELEGRAM_OIDC_CLIENT_ID',
    )
  })

  test('requires strong signing secrets', () => {
    const secret = 'x'.repeat(32)
    expect(validateSecret('ADMIN_SESSION_SECRET', secret)).toBe(secret)
    expect(() =>
      validateSecret('STATISTICS_ACCESS_SECRET', 'too-short'),
    ).toThrow('STATISTICS_ACCESS_SECRET')
    expect(() => validateSecret('ADMIN_SESSION_SECRET', undefined)).toThrow(
      'ADMIN_SESSION_SECRET',
    )
  })
})
