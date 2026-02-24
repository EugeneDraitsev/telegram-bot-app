/**
 * Tool for getting current date and time
 */

import type { AgentTool } from '../types'
import { requireToolContext } from './context'

const TIMEZONE_LABELS: Record<string, string> = {
  'Europe/Moscow': 'Москва',
  'Europe/Kiev': 'Киев',
  'Europe/Minsk': 'Минск',
  'America/New_York': 'Нью-Йорк',
  'America/Los_Angeles': 'Лос-Анджелес',
  'Europe/London': 'Лондон',
  'Europe/Paris': 'Париж',
  'Asia/Tokyo': 'Токио',
  'Asia/Shanghai': 'Шанхай',
  UTC: 'UTC',
}

export const dateTimeTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'get_datetime',
    description:
      'Get current date and time. Use when user asks about current time, date, day of week.',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description:
            'Timezone in IANA format (e.g., "Europe/Moscow"). Defaults to CET (Europe/Warsaw).',
        },
      },
    },
  },
  execute: async (args) => {
    requireToolContext()

    try {
      const tz = (args.timezone as string) || 'Europe/Stockholm'
      const now = new Date()

      const formatter = new Intl.DateTimeFormat('ru-RU', {
        timeZone: tz,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })

      const formatted = formatter.format(now)
      const label = TIMEZONE_LABELS[tz] || tz

      return `Current date and time (${label}): ${formatted}`
    } catch (_error) {
      const now = new Date()
      return `Current UTC date and time: ${now.toISOString()}`
    }
  },
}
