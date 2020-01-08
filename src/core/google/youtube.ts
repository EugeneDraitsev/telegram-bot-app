import { sample, take } from 'lodash'
import fetch from 'node-fetch'

const YOUTUBE_TOKEN = process.env.YOUTUBE_TOKEN || 'set-youtube-token'
const BASE_URL = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video'
const RESULT_PREFIX = 'https://youtu.be/'

type YoutubeVideo = {
  id: {
    videoId: string;
  };
}

export async function searchYoutube(query: string): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}&key=${YOUTUBE_TOKEN}&q=${encodeURI(query)}&maxResults=${8}`)
    const json = await response.json()
    const relevantItems = take(json.items, 3)
    return `${RESULT_PREFIX}${sample(relevantItems.map((item: YoutubeVideo) => item.id.videoId))}`
  } catch (e) {
    return `No results for: ${query}`
  }
}
