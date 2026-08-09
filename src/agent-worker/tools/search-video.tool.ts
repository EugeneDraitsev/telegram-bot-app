/**
 * Tool for finding video links with grounded web search.
 * Uses OpenAI web search with a specialized prompt for video search.
 */

import { getErrorMessage } from '@tg-bot/common'
import { WEB_SEARCH_TOTAL_TIMEOUT_MS } from '../agent/models'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'
import { searchWebWithFallback } from './web-search-runner'

const URL_REGEX = /https?:\/\/[^\s<>)"\]}]+/i

function extractFirstUrl(text: string): string | null {
  const match = text.match(URL_REGEX)
  if (!match) {
    return null
  }

  const rawUrl = match[0].trim()
  const sanitized = rawUrl.replace(/[.,;:!?]+$/, '')
  return sanitized || null
}

function buildVideoSearchPrompt(query: string): string {
  return [
    'Find one relevant video URL for this request.',
    'Prefer YouTube. If unavailable, use another direct video page URL.',
    'Return only one full URL and a very short title.',
    `Query: ${query}`,
  ].join('\n')
}

export const searchVideoTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'search_video',
    description:
      'Find a relevant video link on the web. Use when user asks for a video, clip, tutorial, music video.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for finding the video. Be specific.',
        },
        comment: {
          type: 'string',
          description: 'Optional comment to send with the found video link',
        },
      },
      required: ['query'],
    },
  },
  timeoutMs: WEB_SEARCH_TOTAL_TIMEOUT_MS,
  execute: async (args) => {
    const { message } = requireToolContext()

    try {
      const query = (args.query as string).trim()
      if (!query) {
        throw new Error('Query cannot be empty')
      }

      const searchResult = await searchWebWithFallback(
        query,
        'brief',
        {
          groundedPrompt: buildVideoSearchPrompt(query),
          fallbackQuery: query,
          chatId: message.chat.id,
        },
        { name: 'video_search' },
      )
      const videoUrl = extractFirstUrl(searchResult)

      if (!videoUrl) {
        addResponse({ type: 'text', text: searchResult })
        return 'No direct video URL found, added web search answer as text'
      }

      addResponse({
        type: 'video',
        url: videoUrl,
        caption: (args.comment as string)?.trim() || undefined,
      })

      return `Found video URL: ${videoUrl}`
    } catch (error) {
      throw new Error(`Error searching video: ${getErrorMessage(error)}`)
    }
  },
}
