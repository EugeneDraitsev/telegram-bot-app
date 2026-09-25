/**
 * Tool for finding GIFs via the Giphy API.
 * Requires GIPHY_API_KEY environment variable.
 */

import { getErrorMessage, sample } from '@tg-bot/common'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

const GIPHY_RESULTS_LIMIT = 20

type GiphyImage = { url?: string; mp4?: string }

export type GiphyGif = {
  images?: Partial<
    Record<
      'original_mp4' | 'original' | 'downsized' | 'fixed_height',
      GiphyImage
    >
  >
}

export async function fetchGiphyGifs(
  path: string,
  params: Record<string, string | number>,
): Promise<GiphyGif[]> {
  const apiKey = process.env.GIPHY_API_KEY
  if (!apiKey) {
    throw new Error('Giphy API key not configured')
  }
  const query = new URLSearchParams({ api_key: apiKey })
  for (const [key, value] of Object.entries(params)) {
    query.set(key, String(value))
  }
  const response = await fetch(`https://api.giphy.com/v1/${path}?${query}`)
  if (!response.ok) {
    throw new Error(`Giphy API error: ${response.status}`)
  }
  const { data } = (await response.json()) as { data?: GiphyGif[] }
  return data ?? []
}

export function getMediaUrl(gif: GiphyGif): string | null {
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
  const data = await fetchGiphyGifs('gifs/search', {
    q: query,
    limit: GIPHY_RESULTS_LIMIT,
    rating: 'g',
    lang: 'en',
  })

  const picked = sample(data)
  return picked ? getMediaUrl(picked) : null
}

export const searchGifTool: AgentTool = {
  execution: ['terminal'],
  declaration: {
    type: 'function',
    name: 'search_gif',
    description:
      'Find a direct gif/mp4/webm media URL for reactions or short loops.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
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
      throw new Error('Error searching gif: Query cannot be empty')
    }

    try {
      const mediaUrl = await searchGiphyGif(query)

      if (!mediaUrl) {
        throw new Error('No GIF found for this query')
      }

      addResponse({
        type: 'animation',
        url: mediaUrl,
      })
      return `Found GIF: ${mediaUrl}`
    } catch (error) {
      throw new Error(`Error searching gif: ${getErrorMessage(error)}`)
    }
  },
}
