import { getOptionalEnv } from './utils/env.utils'

export const FRONTEND_BASE_URL =
  getOptionalEnv('FRONTEND_BASE_URL') ?? 'https://telegram-bot-ui.vercel.app'
