export function validateBotOwnerId(value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized || !/^[1-9]\d*$/.test(normalized)) {
    throw new Error('BOT_OWNER_ID must be a positive numeric Telegram user id')
  }
  return normalized
}

export function validateTelegramOidcClientId(
  value: string | undefined,
): string {
  const normalized = value?.trim()
  if (!normalized || !/^[1-9]\d*$/.test(normalized)) {
    throw new Error(
      'TELEGRAM_OIDC_CLIENT_ID must be a positive numeric client id',
    )
  }
  return normalized
}

export function validateAdminSessionSecret(value: string | undefined): string {
  if (!value || value.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET must contain at least 32 characters')
  }
  return value
}

if (import.meta.main) {
  validateBotOwnerId(process.env.BOT_OWNER_ID)
  validateTelegramOidcClientId(process.env.TELEGRAM_OIDC_CLIENT_ID)
  validateAdminSessionSecret(process.env.ADMIN_SESSION_SECRET)
  process.stdout.write('Deployment configuration is valid.\n')
}
