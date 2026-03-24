/**
 * Web search tool.
 * Uses grounded Gemini search first, then falls back to Google Custom Search.
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
      'Search the web for current information. Use this for any factual queries: prices, releases, product comparisons, news, sports scores, events, and similar lookups. Returns a concise summary with fresh data from Google Search.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'The search query (e.g. "bitcoin price", "cardano ADA price today"). Preserve exact product names from the user message when relevant.',
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
  timeoutMs: 15_000,
}
