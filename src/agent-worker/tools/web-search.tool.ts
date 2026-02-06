/**
 * Tool for searching the web using grounded Google Search.
 * Pure tool - adds response to collector, doesn't send directly.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { searchWeb } from '../services'
import { addResponse, requireToolContext } from './context'

export const webSearchTool = new DynamicStructuredTool({
  name: 'web_search',
  description:
    'Search the web for current information using grounded Google Search. Use for news, facts, prices, events, sports scores, and any other time-sensitive questions.',
  schema: z.object({
    query: z
      .string()
      .describe(
        'The search query or question (e.g., "latest iPhone price", "who won World Cup 2024")',
      ),
    format: z
      .enum(['brief', 'detailed', 'list'])
      .optional()
      .describe(
        'Response format: brief=short answer, detailed=more context, list=concise bullet list. Default: brief',
      ),
  }),
  func: async ({ query, format = 'brief' }) => {
    requireToolContext()

    try {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) {
        return 'Error searching web: Query cannot be empty'
      }

      const text = await searchWeb(normalizedQuery, format)
      addResponse({ type: 'text', text })

      return `Web search completed for: "${normalizedQuery}"`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `Error searching web: ${errorMsg}`
    }
  },
})
