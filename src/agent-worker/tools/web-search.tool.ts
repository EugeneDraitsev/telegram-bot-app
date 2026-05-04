import { getErrorMessage } from '@tg-bot/common'
import {
  searchWebOpenAi,
  type WebSearchResponseFormat,
} from '../services/openai-web-search'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

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
  execute: async (args) => {
    const { message } = requireToolContext()
    const query = typeof args.query === 'string' ? args.query.trim() : ''

    if (!query) {
      return 'Error: web_search query cannot be empty'
    }

    try {
      return await searchWebOpenAi(query, getSearchFormat(args.format), {
        chatId: message.chat?.id,
      })
    } catch (error) {
      return `Error searching web: ${getErrorMessage(error)}`
    }
  },
}
