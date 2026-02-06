/**
 * Tool for sending text messages
 * Pure tool - adds response to collector, doesn't send directly
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { generateText } from '../services'
import { addResponse, requireToolContext } from './context'

export const sendTextTool = new DynamicStructuredTool({
  name: 'send_text',
  description:
    'Send a text message to the user. Use for replies, answers, conversations, jokes. Can use Google Search for factual/current information.',
  schema: z.object({
    message: z.string().describe('The text message to send'),
    useGroundedSearch: z
      .boolean()
      .optional()
      .describe(
        'Use Google Search for up-to-date factual information (news, prices, events)',
      ),
  }),
  func: async ({ message, useGroundedSearch }) => {
    requireToolContext()

    try {
      const normalizedMessage = message.trim()
      if (!normalizedMessage) {
        return 'Error: Message cannot be empty'
      }

      const text = useGroundedSearch
        ? await generateText(normalizedMessage, true)
        : normalizedMessage

      addResponse({ type: 'text', text })
      return `Added text response: "${text.slice(0, 100)}..."`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `Error: ${errorMsg}`
    }
  },
})
