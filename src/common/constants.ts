import { getOptionalEnv } from './utils/env.utils'

export const FRONTEND_BASE_URL =
  getOptionalEnv('FRONTEND_BASE_URL') ?? 'https://telegram-bot-ui.vercel.app'

/** Reaction the agent sets on a message it decided to answer. */
export const AGENT_REACTION = '👀'

/**
 * Calendar zone for chat statistics. Day and month buckets are cut here, not in
 * UTC, so "yesterday" on the chart is the viewer's yesterday rather than a
 * window shifted by the UTC offset. Must match the zone the UI formats with.
 */
export const STATISTICS_TIME_ZONE = 'Europe/Stockholm'
