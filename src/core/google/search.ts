import { every, filter, get, includes, sample } from 'lodash'
import axios from 'axios'

const googleSearchToken = process.env.GOOGLE_SEARCH_TOKEN || 'set_your_token'
const cxToken = process.env.GOOGLE_CX_TOKEN || 'set_your_token'

type Image = { mime: string }

const isResponseImage = (headers: Headers): boolean =>
  (headers['content-type'] || '').split('/')[0] === 'image'
const filterMimeTypes = (item: Image): boolean =>
  every(['ico', 'svg'], (x) => !includes(item.mime, x))

const getImage = async (url: string, tbUrl: string): Promise<Buffer> => {
  try {
    const imageResponse = await axios(url, { timeout: 10000, responseType: 'arraybuffer' })

    if (isResponseImage(imageResponse.headers)) {
      return Buffer.from(imageResponse.data)
    }
  } catch (e) {
    console.log('Failed to load image. Trying to load TabUrl') // eslint-disable-line no-console
  }

  try {
    if (tbUrl) {
      const tabImageResponse = await axios(tbUrl, { timeout: 5000, responseType: 'arraybuffer' })

      if (isResponseImage(tabImageResponse.headers)) {
        return Buffer.from(tabImageResponse.data)
      }
    }
    throw new Error()
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    throw new Error(`Can't load image: ${url} (preview: ${tbUrl})`)
  }
}

export const searchImage = async (query: string): Promise<{ image: Buffer; url: string }> => {
  if (!query) {
    return Promise.reject(new Error("We can't search with an empty text message"))
  }

  try {
    const url =
      'https://www.googleapis.com/customsearch/v1?searchType=image&num=10&filter=1&gl=by' +
      `&key=${googleSearchToken}&cx=${cxToken}&q=${encodeURI(query)}`
    const response = await axios(url, { timeout: 5000 }).then((r) => r.data)

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
    return Promise.reject(new Error("Can't load image to telegram"))
  }
}
