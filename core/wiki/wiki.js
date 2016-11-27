'use strict'
const request = require('request')
const rp = require('request-promise')

function search(query) {
  const lang = query.match(/^[А-Яа-яёЁ]+/) ? 'ru' : 'en'
  const baseUrl = `https://${lang}.wikipedia.org/w/api.php`
  const url = `${baseUrl}?action=opensearch&format=json&limit=1&namespace=0&search=${encodeURIComponent(query)}`

  return rp(url)
    .then(response => {
      const result = JSON.parse(response)[3][0]
      return result ? result : `Failed to find article for term: ${query}`
    })
}

module.exports = {search};