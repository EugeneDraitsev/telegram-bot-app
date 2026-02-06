/**
 * Tool for searching YouTube videos
 * Pure tool - adds response to collector, doesn't send directly
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { searchWeb, searchYoutube } from '../services'
import { addResponse, requireToolContext } from './context'

const YOUTUBE_URL_REGEX =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[A-Za-z0-9_-]+(?:[&?][^\s]*)?|youtu\.be\/[A-Za-z0-9_-]+(?:\?[^\s]*)?)/i

function extractYoutubeUrl(text: string): string | null {
  const match = text.match(YOUTUBE_URL_REGEX)
  return match?.[0] ?? null
}

export const searchVideoTool = new DynamicStructuredTool({
  name: 'search_video',
  description:
    'Search for a YouTube video and send the link. Use when user asks for a video, clip, tutorial, music video, or any video content. Uses YouTube API first and falls back to web search.',
  schema: z.object({
    query: z
      .string()
      .describe(
        'Search query for finding the video. Be specific about what kind of video.',
      ),
    comment: z
      .string()
      .optional()
      .describe('Optional comment to send along with the video link'),
  }),
  func: async ({ query, comment }) => {
    requireToolContext()

    try {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) {
        return 'Error searching video: Query cannot be empty'
      }

      const result = await searchYoutube(normalizedQuery)

      if (result) {
        addResponse({
          type: 'video',
          url: result.url,
          caption: comment?.trim() || undefined,
        })

        return `Found video: "${result.title}" - ${result.url}`
      }

      const webFallbackText = await searchWeb(
        `Find one relevant YouTube video for query: ${normalizedQuery}. Return direct YouTube URL and very short title.`,
        'brief',
      )
      const fallbackUrl = extractYoutubeUrl(webFallbackText)

      if (fallbackUrl) {
        addResponse({
          type: 'video',
          url: fallbackUrl,
          caption: comment?.trim() || undefined,
        })
        return `Found video via web fallback: ${fallbackUrl}`
      }

      addResponse({
        type: 'text',
        text: webFallbackText,
      })
      return `No direct YouTube link found, added web search answer`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Search failed'
      return `Error searching video: ${errorMsg}`
    }
  },
})
