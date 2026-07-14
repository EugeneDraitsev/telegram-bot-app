import { hasValidTelegramWebhookSecret } from '../webhook-auth'

describe('Telegram webhook authentication', () => {
  test('accepts the configured secret regardless of header casing', () => {
    expect(
      hasValidTelegramWebhookSecret(
        { 'X-Telegram-Bot-Api-Secret-Token': 'secret-value' },
        'secret-value',
      ),
    ).toBe(true)
  })

  test('rejects missing or incorrect secrets', () => {
    expect(hasValidTelegramWebhookSecret({}, 'secret-value')).toBe(false)
    expect(
      hasValidTelegramWebhookSecret(
        { 'x-telegram-bot-api-secret-token': 'wrong-value' },
        'secret-value',
      ),
    ).toBe(false)
  })

  test('fails closed when the expected secret is not configured', () => {
    expect(
      hasValidTelegramWebhookSecret(
        { 'x-telegram-bot-api-secret-token': 'secret-value' },
        undefined,
      ),
    ).toBe(false)
  })
})
