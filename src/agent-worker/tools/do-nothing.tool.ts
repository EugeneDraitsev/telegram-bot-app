/**
 * Tool for explicitly doing nothing
 * Used when agent decides not to respond
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

export const doNothingTool = new DynamicStructuredTool({
  name: 'do_nothing',
  description:
    'Explicitly choose not to respond. Use when the message is not directed at the bot, when responding would be inappropriate, or when you are unsure.',
  schema: z.object({
    reason: z
      .string()
      .optional()
      .describe('Optional reason for not responding'),
  }),
  func: async ({ reason }) => {
    return reason
      ? `Decided not to respond: ${reason}`
      : 'Decided not to respond'
  },
})
