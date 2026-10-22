import { sample } from './array.utils'
import { getRequiredEnv } from './env.utils'

const BRAVE_IMAGE_SEARCH_URL =
  'https://api.search.brave.com/res/v1/images/search'
const TIMEOUT_MS = 5000
// The Brave free plan allows one request per second, so parallel searches
// from different chats or agent tool calls wait for the next slot.
const RATE_LIMIT_RETRIES = 2
const RATE_LIMIT_DELAY_MS = 1100

interface BraveImage {
  thumbnail?: { src?: string }
  properties?: { url?: string }
}

export interface ImageSearchResult {
  url: string
  thumbnailUrl: string
}

const wait = (durationMs: number) =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

/**
 * Search images with Brave and return one random result. The thumbnail is
 * served by Brave's image proxy, so it loads even when the original host
 * blocks Telegram.
 */
export async function searchImage(query: string): Promise<ImageSearchResult> {
  if (!query.trim()) {
    throw new Error('Search query cannot be empty')
  }

  const url = `${BRAVE_IMAGE_SEARCH_URL}?q=${encodeURIComponent(query)}&count=10&safesearch=off`
  const headers = {
    Accept: 'application/json',
    'X-Subscription-Token': getRequiredEnv('BRAVE_API_KEY'),
  }

  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
      await wait(RATE_LIMIT_DELAY_MS)
      continue
    }
    if (!response.ok) {
      throw new Error(`Brave image search error: ${response.status}`)
    }

    const data = (await response.json()) as { results?: BraveImage[] }
    const image = sample(
      data.results?.filter((item) => item.properties?.url) ?? [],
    )
    if (!image?.properties?.url) {
      throw new Error(`No images found for: ${query}`)
    }

    return {
      url: image.properties.url,
      thumbnailUrl: image.thumbnail?.src ?? '',
    }
  }
}
