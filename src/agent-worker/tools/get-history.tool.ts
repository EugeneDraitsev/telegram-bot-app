/**
 * Tool for getting chat history
 */

import {
  DEFAULT_AGENT_HISTORY_LIMIT,
  formatHistoryForDisplay,
  getErrorMessage,
  getRawHistory,
  getRecentRawHistory,
  MAX_HISTORY_TOOL_LIMIT,
} from '@tg-bot/common'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

export const getHistoryTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'get_chat_history',
    description:
      'Get chat messages for context. Recent 40 messages are already available by default, but you can request more or all available history when needed.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description:
            'Number of recent messages to retrieve. Default: 40, Max: 200. Use all=true for the full available history.',
        },
        all: {
          type: 'boolean',
          description:
            'Set to true to retrieve all available history from the last 24 hours.',
        },
      },
    },
  },
  execute: async (args) => {
    const { message } = requireToolContext()
    const chatId = message.chat?.id

    if (!chatId) {
      return 'Error: No chat ID available'
    }

    try {
      const limit = args.limit as number | undefined
      const wantsAll = args.all === true
      const normalizedLimit = Number.isFinite(limit)
        ? Math.min(
            Math.max(Math.trunc(limit ?? DEFAULT_AGENT_HISTORY_LIMIT), 1),
            MAX_HISTORY_TOOL_LIMIT,
          )
        : DEFAULT_AGENT_HISTORY_LIMIT

      if (wantsAll) {
        const rawHistory = await getRawHistory(chatId)
        return formatHistoryForDisplay(rawHistory, {
          limit: rawHistory.length || DEFAULT_AGENT_HISTORY_LIMIT,
          headerLabel: 'Available history',
        })
      }

      const recentHistory = await getRecentRawHistory(chatId, normalizedLimit)
      return formatHistoryForDisplay(recentHistory, normalizedLimit)
    } catch (error) {
      return `Error getting history: ${getErrorMessage(error)}`
    }
  },
}
