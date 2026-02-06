/**
 * YouTube Data API v3 for video search
 * Independent implementation for agent-worker
 */

const YOUTUBE_TOKEN = process.env.YOUTUBE_TOKEN || ''
const BASE_URL =
  'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video'
const RESULT_PREFIX = 'https://youtu.be/'

interface YoutubeSearchItem {
  id: {
    videoId: string
  }
  snippet: {
    title: string
    description: string
    channelTitle: string
  }
}

interface VideoResult {
  url: string
  videoId: string
  title?: string
  channelTitle?: string
}

/**
 * Search for videos on YouTube
 * Returns URL and metadata of the top relevant result
 */
export async function searchYoutube(
  query: string,
): Promise<VideoResult | null> {
  if (!query?.trim()) {
    return null
  }

  if (!YOUTUBE_TOKEN) {
    throw new Error('YouTube API token not configured')
  }

  try {
    const url = `${BASE_URL}&maxResults=8&order=relevance&key=${YOUTUBE_TOKEN}&q=${encodeURIComponent(query)}`

    const response = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`)
    }

    const data = await response.json()
    const items = data.items as YoutubeSearchItem[]

    const videoItems = items?.filter((item) => item?.id?.videoId)

    if (!videoItems?.length) {
      return null
    }

    const video = videoItems[0]
    return {
      url: `${RESULT_PREFIX}${video.id.videoId}`,
      videoId: video.id.videoId,
      title: video.snippet?.title,
      channelTitle: video.snippet?.channelTitle,
    }
  } catch (error) {
    console.error('YouTube search error:', error)
    return null
  }
}
