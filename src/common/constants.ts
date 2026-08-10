import { getOptionalEnv } from './utils/env.utils'

export const FRONTEND_BASE_URL =
  getOptionalEnv('FRONTEND_BASE_URL') ?? 'https://telegram-bot-ui.vercel.app'

/** Reaction the agent sets on a message it decided to answer. */
export const AGENT_REACTION = '👀'
