import { sample } from 'lodash-es'
import fetch from 'node-fetch'

const YOUTUBE_TOKEN = process.env.YOUTUBE_TOKEN || 'set-youtube-token'
const BASE_URL = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video'
const RESULT_PREFIX = 'https://youtu.be/'

type YoutubeVideo = {
  id: {
    videoId: string;
  };
}

export const searchYoutube = (query: string): Promise<string> =>
  fetch(`${BASE_URL}&key=${YOUTUBE_TOKEN}&q=${encodeURI(query)}&maxResults=${8}`)
    .then((res) => res.json())
    .then((response) => `${RESULT_PREFIX}${sample(response.items.map((item: YoutubeVideo) => item.id.videoId))}`)
    .catch(() => `No results for: ${query}`)
