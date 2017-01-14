'use strict'
const _ = require('lodash')
const rp = require('request-promise')
const YOUTUBE_TOKEN = process.env.YOUTUBE_TOKEN || 'set-youtube-token'
const BASE_URL = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video'
const RESULT_PREFIX = 'https://youtu.be/'

function search(query) {
  return rp(`${BASE_URL}&key=${YOUTUBE_TOKEN}&q=${encodeURI(query)}&maxResults=${8}`)
    .then(response => `${RESULT_PREFIX}${_.sample(JSON.parse(response).items.map(item => item.id.videoId))}`)
    .catch(() => `No results for: ${query}`)
}

module.exports = {search}
