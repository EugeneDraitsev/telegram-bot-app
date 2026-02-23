/**
 * Web search tool — uses Google Search grounding via gemini-2.5-flash-lite.
 * Returns search results to the model for composing the final response.
 */

import { getErrorMessage } from '@tg-bot/common'
import { searchWeb } from '../services'
import { type AgentTool, Type } from '../types'
import { requireToolContext } from './context'

export const webSearchTool: AgentTool = {
  declaration: {
    name: 'web_search',
    description:
      'Search the web for current information. Use this for any factual queries: crypto prices, stock prices, exchange rates, news, sports scores, events, etc. Returns a text summary with fresh data from Google Search.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
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
      const result = await searchWeb(query, 'detailed')
      return result
    } catch (error) {
      return `Web search failed: ${getErrorMessage(error)}`
    }
  },
}
