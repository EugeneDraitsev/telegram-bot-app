/**
 * Google Custom Search API for image search
 * Independent implementation for agent-worker
 */

const googleApiKey = process.env.COMMON_GOOGLE_API_KEY || ''
const cxToken = process.env.GOOGLE_CX_TOKEN || ''

interface GoogleImage {
  mime: string
  link: string
  image: { thumbnailLink: string }
}

interface SearchResult {
  url: string
  thumbnailUrl: string
}

/**
 * Pick a random element from array
 */
function sample<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)]
}

/**
 * Filter out problematic mime types (ico, svg)
 */
function filterMimeTypes(item: GoogleImage): boolean {
  return ['ico', 'svg'].every((type) => !item?.mime?.includes(type))
}

/**
 * Search for images using Google Custom Search API
 * Returns URL and thumbnail URL of a random result
 */
export async function searchImage(query: string): Promise<SearchResult> {
  if (!query?.trim()) {
    throw new Error('Search query cannot be empty')
  }

  if (!googleApiKey || !cxToken) {
    throw new Error('Google API credentials not configured')
  }

  const url = `https://www.googleapis.com/customsearch/v1?searchType=image&num=10&filter=1&gl=by&key=${googleApiKey}&cx=${cxToken}&q=${encodeURIComponent(query)}`

  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    throw new Error(`Google API error: ${response.status}`)
  }

  const data = await response.json()
  const filteredItems = (data?.items as GoogleImage[])?.filter(filterMimeTypes)

  if (!filteredItems?.length) {
    throw new Error(`No images found for: ${query}`)
  }

  const image = sample(filteredItems)
  return {
    url: image?.link ?? '',
    thumbnailUrl: image?.image?.thumbnailLink ?? '',
  }
}
