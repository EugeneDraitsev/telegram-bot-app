import { getErrorMessage } from '@tg-bot/common'
import { WEB_SEARCH_TOTAL_TIMEOUT_MS } from '../agent/models'
import type { WebSearchResponseFormat } from '../services/openai-web-search'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'
import { searchWebWithFallback } from './web-search-runner'

const SEARCH_FORMATS = new Set<WebSearchResponseFormat>([
  'brief',
  'detailed',
  'list',
])

function getSearchFormat(value: unknown): WebSearchResponseFormat {
  return typeof value === 'string' && SEARCH_FORMATS.has(value as never)
    ? (value as WebSearchResponseFormat)
    : 'brief'
}

export const webSearchTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'web_search',
    description:
      'Search the web for fresh, current, ambiguous, or URL-based information. Use exact user wording first for named things.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Preserve exact names from the user.',
        },
        format: {
          type: 'string',
          description: 'Response format',
          enum: ['brief', 'detailed', 'list'],
        },
      },
      required: ['query'],
    },
  },
  timeoutMs: WEB_SEARCH_TOTAL_TIMEOUT_MS,
  execute: async (args) => {
    const { message } = requireToolContext()
    const query = typeof args.query === 'string' ? args.query.trim() : ''

    if (!query) {
      throw new Error('Web search query cannot be empty')
    }

    try {
      return await searchWebWithFallback(query, getSearchFormat(args.format), {
        chatId: message.chat?.id,
      })
    } catch (error) {
      throw new Error(`Error searching web: ${getErrorMessage(error)}`)
    }
  },
}
