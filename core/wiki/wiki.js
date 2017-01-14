'use strict'
const rp = require('request-promise')
const helper = require('./../../utils')

function search(query) {
  const lang = helper.hasRussiansLetters(query) ? 'ru' : 'en'
  const baseUrl = `https://${lang}.wikipedia.org/w/api.php`
  const url = `${baseUrl}?action=opensearch&format=json&limit=1&namespace=0&search=${encodeURIComponent(query)}`

  return rp(url)
    .then(response => {
      const result = JSON.parse(response)[3][0]
      return result ? result : `Failed to find article for term: ${query}`
    })
}

module.exports = {search}
