'use strict'
const rp = require('request-promise')
const helper = require('./../../utils')
const key = process.env.TRANSLATION_APP_TOKEN || 'set_your_token'

function translate(text) {
  const lang = helper.hasRussiansLetters(text) ? 'ru-en' : 'en-ru'
  const options = {
    url: 'https://translate.yandex.net/api/v1.5/tr.json/translate',
    qs: {key, lang, text}
  }

  return rp.post(options)
    .then(response => {
      return JSON.parse(response).text[0]
    })
    .catch(() => 'Error from translation service')
}

module.exports = {translate}