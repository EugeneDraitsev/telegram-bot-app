import { every, filter, get, includes, sample } from 'lodash'
import fetch, { Headers } from 'node-fetch'

const googleSearchToken = process.env.GOOGLE_SEARCH_TOKEN || 'set_your_token'
const cxToken = process.env.GOOGLE_CX_TOKEN || 'set_your_token'

const isResponseImage = (headers: Headers) => headers.get('content-type')!.split('/')[0] === 'image'
const filterMimeTypes = (item: any) => every(['ico', 'svg'], x => !includes(item.mime, x))

const getImage = async (url: string, tbUrl: string) => {
  try {
    const imageResponse = await fetch(url, { timeout: 10000 })

    if (isResponseImage(imageResponse.headers)) {
      return imageResponse.buffer()
    }

    if (tbUrl) {
      const tabImageResponse = await fetch(url, { timeout: 10000 })

      if (isResponseImage(tabImageResponse.headers)) {
        return tabImageResponse.buffer()
      }
    }
    throw new Error()
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    throw new Error(`Can't load image: ${url} (preview: ${tbUrl})`)
  }
}

export const searchImage = async (query: string) => {
  try {
    const url = 'https://www.googleapis.com/customsearch/v1?searchType=image&num=10&filter=1&gl=by' +
      `&key=${googleSearchToken}&cx=${cxToken}&q=${encodeURI(query)}`
    const response = await fetch(url, { timeout: 10000 }).then(r => r.json())

    if (get(response, 'items.length') > 0) {
      const image = sample(filter(response.items, filterMimeTypes))
      const imageUrl = image.link
      const tbUrl = image.image.thumbnailLink

      const loadedImage = await getImage(imageUrl, tbUrl)

      return { image: loadedImage, url: imageUrl }
    }
    return Promise.reject(new Error(`Google can't find ${query} for you`))
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    return Promise.reject(new Error('Can\'t load image to telegram'))
  }
}
