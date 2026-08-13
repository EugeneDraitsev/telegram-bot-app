export function validateBotOwnerId(value: string | undefined): string {
  const normalized = value?.trim()
  if (!normalized || !/^[1-9]\d+$/.test(normalized)) {
    throw new Error('BOT_OWNER_ID must be a positive numeric Telegram user id')
  }
  return normalized
}

if (import.meta.main) {
  validateBotOwnerId(process.env.BOT_OWNER_ID)
  process.stdout.write('Deployment configuration is valid.\n')
}
