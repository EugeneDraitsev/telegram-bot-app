/**
 * Tool for finding GIFs via Giphy SDK.
 * Requires GIPHY_API_KEY environment variable.
 */

import { GiphyFetch } from '@giphy/js-fetch-api'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'
import type { IGif } from '@giphy/js-types'

import { getErrorMessage, sample } from '@tg-bot/common'
import { addResponse, requireToolContext } from './context'

const GIPHY_RESULTS_LIMIT = 20

let giphyClient: GiphyFetch | null = null

export function getGiphyClient(): GiphyFetch {
  const apiKey = process.env.GIPHY_API_KEY
  if (!apiKey) {
    throw new Error('Giphy API key not configured')
  }
  if (!giphyClient) {
    giphyClient = new GiphyFetch(apiKey)
  }
  return giphyClient
}

export function getMediaUrl(gif: IGif): string | null {
  const images = gif.images
  return (
    images?.original_mp4?.mp4 ||
    images?.original?.mp4 ||
    images?.original?.url ||
    images?.downsized?.url ||
    images?.fixed_height?.url ||
    null
  )
}

export async function searchGiphyGif(query: string): Promise<string | null> {
  const gf = getGiphyClient()
  const { data } = await gf.search(query, {
    limit: GIPHY_RESULTS_LIMIT,
    rating: 'g',
    lang: 'en',
  })

  const picked = sample(data ?? [])
  return picked ? getMediaUrl(picked) : null
}

export const searchGifTool = new DynamicStructuredTool({
  name: 'search_gif',
  description:
    'Find a direct gif/mp4/webm media URL for reactions or short loops.',
  schema: z.object({
    query: z.string().describe('Search query for gif/meme/reaction'),
  }),
  func: async ({ query }) => {
    requireToolContext()

    const normalizedQuery = query.trim()
    if (!normalizedQuery) {
      return 'Error searching gif: Query cannot be empty'
    }

    try {
      const mediaUrl = await searchGiphyGif(normalizedQuery)

      if (!mediaUrl) {
        return 'No GIF found for this query'
      }

      addResponse({
        type: 'animation',
        url: mediaUrl,
      })
      return `Found GIF: ${mediaUrl}`
    } catch (error) {
      const errorMsg = getErrorMessage(error)
      return `Error searching gif: ${errorMsg}`
    }
  },
})
