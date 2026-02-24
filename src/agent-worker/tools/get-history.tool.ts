/**
 * Tool for getting chat history
 */

import {
  formatHistoryForDisplay,
  getErrorMessage,
  getRawHistory,
} from '@tg-bot/common'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

export const getHistoryTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'get_chat_history',
    description:
      'Get recent chat messages for context. Use when you need to understand the conversation history.',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description:
            'Number of recent messages to retrieve. Default: 10, Max: 50',
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
      const rawHistory = await getRawHistory(chatId)
      const limit = args.limit as number | undefined
      const normalizedLimit = Number.isFinite(limit)
        ? Math.trunc(limit ?? 10)
        : 10
      const limitedCount = Math.min(Math.max(normalizedLimit, 1), 50)

      return formatHistoryForDisplay(rawHistory, limitedCount)
    } catch (error) {
      return `Error getting history: ${getErrorMessage(error)}`
    }
  },
}
