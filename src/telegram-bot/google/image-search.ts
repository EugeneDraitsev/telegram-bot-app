import { sample } from '@tg-bot/common'

const googleApiKey = process.env.GOOGLE_API_KEY || 'set_your_token'
const cxToken = process.env.GOOGLE_CX_TOKEN || 'set_your_token'

type Image = { mime: string; link: string; image: { thumbnailLink: string } }

const filterMimeTypes = (item: Image): boolean =>
  ['ico', 'svg'].every((type) => !item?.mime?.includes(type))

export const searchImage = async (
  query: string,
): Promise<{ tbUrl: string; url: string }> => {
  if (!query) {
    return Promise.reject(
      new Error("We can't search with an empty text message"),
    )
  }

  const url = `https://www.googleapis.com/customsearch/v1?searchType=image&num=10&filter=1&gl=by&key=${googleApiKey}&cx=${cxToken}&q=${encodeURI(query)}`
  const response = await fetch(url, {
    signal: globalThis.AbortSignal.timeout(5_000),
  }).then((r) => r.json())

  const filteredItems = response?.items?.filter(filterMimeTypes) as Image[]

  if (filteredItems?.length) {
    const image = sample(filteredItems)
    const url = image?.link ?? ''
    const tbUrl = image?.image?.thumbnailLink ?? ''

    return { url, tbUrl }
  }

  return Promise.reject(new Error(`Google can't find ${query} for you`))
}
