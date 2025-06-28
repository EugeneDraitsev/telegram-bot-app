import { hasRussiansLetters } from '@tg-bot/common/utils'

export const searchWiki = async (query = '') => {
  const lang = hasRussiansLetters(query) ? 'ru' : 'en'
  const baseUrl = `https://${lang}.wikipedia.org/w/api.php`
  const url = `${baseUrl}?action=opensearch&format=json&limit=1&namespace=0&search=${encodeURIComponent(
    query.trim(),
  )}`

  try {
    const response = await fetch(url)
    const result = await response.json()
    return result[3][0] || `Failed to find article for term: ${query}`
  } catch (_e) {
    return 'Wiki error'
  }
}
