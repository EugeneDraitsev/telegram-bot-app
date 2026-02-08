/**
 * Tool for finding video links with grounded web search.
 * Uses generic web search instead of direct YouTube API.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { searchWeb } from '../services'
import { addResponse, requireToolContext } from './context'

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

export const searchVideoTool = new DynamicStructuredTool({
  name: 'search_video',
  description:
    'Find a relevant video link on the web. Use when user asks for a video, clip, tutorial, music video, or stream.',
  schema: z.object({
    query: z
      .string()
      .describe('Search query for finding the video. Be specific.'),
    comment: z
      .string()
      .optional()
      .describe('Optional comment to send with the found video link'),
  }),
  func: async ({ query, comment }) => {
    requireToolContext()

    try {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) {
        return 'Error searching video: Query cannot be empty'
      }

      const searchResult = await searchWeb(
        buildVideoSearchPrompt(normalizedQuery),
        'brief',
      )
      const videoUrl = extractFirstUrl(searchResult)

      if (!videoUrl) {
        addResponse({
          type: 'text',
          text: searchResult,
        })
        return 'No direct video URL found, added web search answer as text'
      }

      addResponse({
        type: 'video',
        url: videoUrl,
        caption: comment?.trim() || undefined,
      })

      return `Found video URL: ${videoUrl}`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Search failed'
      return `Error searching video: ${errorMsg}`
    }
  },
})
