/**
 * Tool for finding GIFs via Giphy SDK.
 * Requires GIPHY_API_KEY environment variable.
 */

import { GiphyFetch } from '@giphy/js-fetch-api'
import type { IGif } from '@giphy/js-types'

import { getErrorMessage, sample } from '@tg-bot/common'
import { type AgentTool, Type } from '../types'
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

export const searchGifTool: AgentTool = {
  declaration: {
    name: 'search_gif',
    description:
      'Find a direct gif/mp4/webm media URL for reactions or short loops.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description: 'Search query for gif/meme/reaction',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    const query = (args.query as string).trim()
    if (!query) {
      return 'Error searching gif: Query cannot be empty'
    }

    try {
      const mediaUrl = await searchGiphyGif(query)

      if (!mediaUrl) {
        return 'No GIF found for this query'
      }

      addResponse({
        type: 'animation',
        url: mediaUrl,
      })
      return `Found GIF: ${mediaUrl}`
    } catch (error) {
      return `Error searching gif: ${getErrorMessage(error)}`
    }
  },
}
