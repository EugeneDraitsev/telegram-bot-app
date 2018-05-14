import { get, sample } from 'lodash'
import fetch from 'node-fetch'

const googleSearchToken = process.env.GOOGLE_SEARCH_TOKEN || 'set_your_token'
const cxToken = process.env.GOOGLE_CX_TOKEN || 'set_your_token'

const isResponseImage = (headers: Headers) => headers.get('content-type')!.split('/')[0] === 'image'

function getImage(url: string, tbUrl: string) {
  return fetch(url)
    .then(response => isResponseImage(response.headers) ? Promise.resolve(response) : Promise.reject(null))
    .then(res => res.buffer())
    .catch(() => {
      if (tbUrl) {
        return fetch(tbUrl)
          .then(res => isResponseImage(res.headers) ? Promise.resolve(res) : Promise.reject(null))
          .then(res => res.buffer())
      }
      return Promise.reject(null)
    })
}

export const searchImage = (query: string) => {
  const url = 'https://www.googleapis.com/customsearch/v1?searchType=image&imgSize=xlarge&alt=json&num=10&start=1' +
    `&key=${googleSearchToken}&cx=${cxToken}&q=${encodeURI(query)}`

  return fetch(url)
    .then(r => r.json())
    .then((responseData) => {
      if (get(responseData, 'items.length') > 0) {
        const image = sample(responseData.items)
        const imageUrl = image.link
        const tbUrl = image.image.thumbnailLink

        return getImage(imageUrl, tbUrl)
          .then(res => ({ image: res, url: imageUrl }))
          .catch(() => Promise.reject(`Can't load image: ${imageUrl}`))
      }

      return Promise.reject(`Google can't find ${query} for you`)
    })
    .catch(e => Promise.reject(typeof e === 'string' ? e : 'Error getting search result from google.'))
}
