/**
 * Tool for getting chat history
 * This tool returns data to the agent, doesn't add to collector
 * (history is for agent's context, not for sending to user)
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import {
  formatHistoryForDisplay,
  getErrorMessage,
  getRawHistory,
} from '@tg-bot/common'
import { requireToolContext } from './context'

export const getHistoryTool = new DynamicStructuredTool({
  name: 'get_chat_history',
  description:
    'Get recent chat messages for context. Use when you need to understand the conversation history or what was discussed before.',
  schema: z.object({
    limit: z
      .number()
      .optional()
      .describe('Number of recent messages to retrieve. Default: 10, Max: 50'),
  }),
  func: async ({ limit = 10 }) => {
    const { message } = requireToolContext()
    const chatId = message.chat?.id

    if (!chatId) {
      return 'Error: No chat ID available'
    }

    try {
      const rawHistory = await getRawHistory(chatId)
      const normalizedLimit = Number.isFinite(limit) ? Math.trunc(limit) : 10
      const limitedCount = Math.min(Math.max(normalizedLimit, 1), 50)

      return formatHistoryForDisplay(rawHistory, limitedCount)
    } catch (error) {
      const errorMsg = getErrorMessage(error)
      return `Error getting history: ${errorMsg}`
    }
  },
})
