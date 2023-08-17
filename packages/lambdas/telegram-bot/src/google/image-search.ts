import { every, filter, get, includes, sample } from 'lodash'

const googleApiKey = process.env.GOOGLE_API_KEY || 'set_your_token'
const cxToken = process.env.GOOGLE_CX_TOKEN || 'set_your_token'

type Image = { mime: string }

const filterMimeTypes = (item: Image): boolean =>
  every(['ico', 'svg'], (x) => !includes(item.mime, x))

export const searchImage = async (
  query: string,
): Promise<{ tbUrl: string; url: string }> => {
  if (!query) {
    return Promise.reject(
      new Error("We can't search with an empty text message"),
    )
  }

  const url =
    'https://www.googleapis.com/customsearch/v1?searchType=image&num=10&filter=1&gl=by' +
    `&key=${googleApiKey}&cx=${cxToken}&q=${encodeURI(query)}`
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5_000),
  }).then((r) => r.json())

  if (get(response, 'items.length') > 0) {
    const image = sample(filter(response.items, filterMimeTypes))
    const url = image.link
    const tbUrl = image.image.thumbnailLink

    return { url, tbUrl }
  }

  return Promise.reject(new Error(`Google can't find ${query} for you`))
}
