/**
 * Tool for finding video links with grounded web search.
 * Uses OpenAI web search with a specialized prompt for video search.
 */

import { getErrorMessage } from '@tg-bot/common'
import { searchWeb } from '../services'
import { WEB_SEARCH_MODEL_LABEL } from '../services/openai-web-search'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext, trackToolModelCall } from './context'

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
  execute: async (args) => {
    const { message } = requireToolContext()

    try {
      const query = (args.query as string).trim()
      if (!query) {
        return 'Error searching video: Query cannot be empty'
      }

      const searchResult = await trackToolModelCall(
        { name: 'video_search', model: WEB_SEARCH_MODEL_LABEL },
        () =>
          searchWeb(query, 'brief', {
            groundedPrompt: buildVideoSearchPrompt(query),
            fallbackQuery: query,
            chatId: message.chat.id,
          }),
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
      return `Error searching video: ${getErrorMessage(error)}`
    }
  },
}
