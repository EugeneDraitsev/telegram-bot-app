import { sample } from '@tg-bot/common'

const YOUTUBE_TOKEN = process.env.YOUTUBE_TOKEN || 'set-youtube-token'
const BASE_URL =
  'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video'
const RESULT_PREFIX = 'https://youtu.be/'
const MAX_RESULTS = 3
const NOT_FOUND_MESSAGE = 'No videos found'

type YoutubeVideo = {
  id: {
    videoId: string
  }
}

export async function searchYoutube(query: string): Promise<string> {
  try {
    const response = await fetch(
      `${BASE_URL}&key=${YOUTUBE_TOKEN}&q=${encodeURI(
        query,
      )}&maxResults=${MAX_RESULTS}`,
    )
    const json = await response.json()
    const videoIds = json.items
      ?.map((item: YoutubeVideo) => item?.id?.videoId)
      ?.filter(Boolean)

    if (videoIds?.length) {
      return `${RESULT_PREFIX}${sample(videoIds)}`
    }
    return NOT_FOUND_MESSAGE
  } catch (_e) {
    return NOT_FOUND_MESSAGE
  }
}
