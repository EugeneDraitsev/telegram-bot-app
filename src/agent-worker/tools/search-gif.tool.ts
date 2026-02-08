/**
 * Tool for finding direct gif/mp4/webm links for memes/reactions.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { searchWeb } from '../services'
import { addResponse, requireToolContext } from './context'

const DIRECT_MEDIA_URL_REGEX =
  /https?:\/\/[^\s<>)"\]}]+?\.(?:gif|mp4|webm)(?:\?[^\s<>)"\]}]*)?/i

function extractDirectMediaUrl(text: string): string | null {
  const match = text.match(DIRECT_MEDIA_URL_REGEX)
  if (!match?.[0]) {
    return null
  }

  const url = match[0].trim().replace(/[.,;:!?]+$/, '')
  return url || null
}

function buildGifSearchPrompt(
  query: string,
  source: 'giphy' | 'tenor' | 'any',
) {
  const sourceHint =
    source === 'any' ? 'Prefer Giphy or Tenor.' : `Use ${source} if possible.`

  return [
    'Find one direct GIF/MP4/WebM media file URL for this request.',
    'Return exactly one direct media URL ending with .gif, .mp4, or .webm.',
    'Do not return page URLs.',
    sourceHint,
    `Query: ${query}`,
  ].join('\n')
}

function hasDirectMediaExtension(url: string): boolean {
  return /\.(gif|mp4|webm)(?:\?|$)/i.test(url)
}

async function isReachableMediaUrl(url: string): Promise<boolean> {
  const signal = AbortSignal.timeout(5000)

  try {
    const headResponse = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal,
    })
    if (!headResponse.ok) {
      return false
    }

    const contentType = headResponse.headers.get('content-type') || ''
    return (
      contentType.toLowerCase().startsWith('video/') ||
      contentType.toLowerCase().includes('gif') ||
      hasDirectMediaExtension(url)
    )
  } catch {
    return false
  }
}

export const searchGifTool = new DynamicStructuredTool({
  name: 'search_gif',
  description:
    'Find a direct gif/mp4/webm media URL for reactions or short loops.',
  schema: z.object({
    query: z.string().describe('Search query for gif/meme/reaction media'),
    source: z
      .enum(['giphy', 'tenor', 'any'])
      .optional()
      .describe('Preferred source. Default: any'),
  }),
  func: async ({ query, source = 'any' }) => {
    requireToolContext()

    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      return 'Error searching gif: Query cannot be empty'
    }

    try {
      const result = await searchWeb(
        buildGifSearchPrompt(normalizedQuery, source),
        'brief',
      )
      const mediaUrl = extractDirectMediaUrl(result)

      if (!mediaUrl) {
        addResponse({ type: 'text', text: result })
        return 'No direct media URL found, added search result as text'
      }
      if (!(await isReachableMediaUrl(mediaUrl))) {
        addResponse({ type: 'text', text: result })
        return 'Found media URL is unreachable, added search result as text'
      }

      addResponse({
        type: 'video',
        url: mediaUrl,
      })
      return `Found gif media URL: ${mediaUrl}`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `Error searching gif: ${errorMsg}`
    }
  },
})
