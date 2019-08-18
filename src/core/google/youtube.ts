import { sample } from 'lodash'
import fetch from 'node-fetch'

const YOUTUBE_TOKEN = process.env.YOUTUBE_TOKEN || 'set-youtube-token'
const BASE_URL = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video'
const RESULT_PREFIX = 'https://youtu.be/'

export function searchYoutube(query: string) {
  return fetch(`${BASE_URL}&key=${YOUTUBE_TOKEN}&q=${encodeURI(query)}&maxResults=${8}`)
    .then((res) => res.json())
    .then((response) => `${RESULT_PREFIX}${sample(response.items.map((item: any) => item.id.videoId))}`)
    .catch(() => `No results for: ${query}`)
}
