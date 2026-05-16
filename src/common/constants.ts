import { getOptionalEnv } from './utils/env.utils'

export const FRONTEND_BASE_URL =
  getOptionalEnv('FRONTEND_BASE_URL') ?? 'https://telegram-bot-ui.vercel.app'

export const CHAT_SEARCH_LOCAL_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
]

export const CHAT_SEARCH_DEFAULT_ALLOWED_ORIGINS = [
  FRONTEND_BASE_URL,
  ...CHAT_SEARCH_LOCAL_ALLOWED_ORIGINS,
]
