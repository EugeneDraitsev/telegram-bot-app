import fetch from 'node-fetch'
import { hasRussiansLetters } from '../utils/'

export function searchWiki(query: string) {
  const lang = hasRussiansLetters(query) ? 'ru' : 'en'
  const baseUrl = `https://${lang}.wikipedia.org/w/api.php`
  const url = `${baseUrl}?action=opensearch&format=json&limit=1&namespace=0&search=${encodeURIComponent(query)}`

  return fetch(url)
    .then(x => x.json())
    .then((response) => {
      const result = response[3][0]
      return result || `Failed to find article for term: ${query}`
    })
}
