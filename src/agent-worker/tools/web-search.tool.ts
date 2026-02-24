/**
 * Web search tool — uses Google Search grounding via gemini-2.5-flash-lite.
 * Returns search results to the model for composing the final response.
 */

import { getErrorMessage } from '@tg-bot/common'
import { searchWeb } from '../services'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

export const webSearchTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'web_search',
    description:
      'Search the web for current information. Use this for any factual queries: crypto prices, stock prices, exchange rates, news, sports scores, events, etc. Returns a text summary with fresh data from Google Search.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The search query (e.g. "bitcoin price", "cardano ADA price today")',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args) => {
    requireToolContext()
    const { query } = args as { query: string }

    try {
      return await searchWeb(query, 'detailed')
    } catch (error) {
      throw new Error(`Web search failed: ${getErrorMessage(error)}`)
    }
  },
}
