import { validateBotOwnerId } from './validate-deployment-config.mjs'

describe('deployment configuration validation', () => {
  test('accepts a positive numeric Telegram user id', () => {
    expect(validateBotOwnerId(' 42 ')).toBe('42')
  })

  test.each([undefined, '', '0', '-1', 'username', '12.5'])(
    'rejects invalid BOT_OWNER_ID %p',
    (value) => {
      expect(() => validateBotOwnerId(value)).toThrow('BOT_OWNER_ID')
    },
  )
})
