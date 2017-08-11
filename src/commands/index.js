const _ = require('lodash')
const telegram = require('../core/telegram/telegram.js')
const google = require('../core/google/search.js')
const huiator = require('../core/text/huiator.js')
const yasno = require('../core/text/yasno.js')
const magic8ball = require('../core/stickers/magic8ball')
const translation = require('../core/yandex/translation.js')
const currency = require('../core/currency/currency.js')
const statistic = require('../core/statistic/statistic')
const youtube = require('../core/google/youtube')
const wiki = require('../core/wiki/wiki')
const dice = require('../core/text/dice.js')
const horoscope = require('../core/horoscope/index.js')
const weather = require('../core/weather/index.js')
const puntoSwitcher = require('../core/text/punto-switcher.js')

const COMMANDS = ['/ps', '/g', '/h', '/y', '/c', '/t', '/z', '/8', '/v', '/w', '/dice', '/all', '/p', '/s']

function parseQuery(query) {
  return query.replace(/\/\S+\s*/g, '').trim()
}

function findCommand(text) {
  return COMMANDS.filter(command => !text.lastIndexOf(command))[0]
}

function processQuery(text, message_id, chat_id, replyText) {
  const query = parseQuery(text) || replyText
  try {
    switch (findCommand(text)) {
      case '/g' : {
        return google.searchImage(query)
          .then(response => telegram.sendPhoto(chat_id, response.image, message_id, response.url))
          .catch(error => telegram.sendMessage(chat_id, error, message_id))
      }

      case '/h': {
        const huext = huiator.huify(query)
        return query === huext ?
          telegram.sendMessage(chat_id, 'https://www.youtube.com/watch?v=q5bc4nmDNio', message_id) :
          telegram.sendMessage(chat_id, huext, message_id)
      }

      case '/y': {
        return telegram.sendMessage(chat_id, yasno.yasnyfy(query), message_id)
      }

      case '/c': {
        return currency.getCurrency()
          .then(result => telegram.sendMessage(chat_id, result))
      }

      case '/t': {
        return translation.translate(query)
          .then(response => telegram.sendMessage(chat_id, response, message_id))
      }

      case '/z': {
        return statistic.getChatStatistic(chat_id).then((result) => {
          const stats = _.orderBy(result.users, 'msgCount', 'desc')
          const messagesCount = stats.reduce((a, b) => a + b.msgCount, 0)
          const message = `User Statistic.\nAll messages: ${messagesCount}\n${stats.map(user =>
            `${user.msgCount} (${((user.msgCount / messagesCount) * 100).toFixed(2)}%) - ${user.username}`).join('\n')}`
          return telegram.sendMessage(chat_id, message)
        })
      }

      case '/8': {
        return telegram.sendSticker(chat_id, magic8ball.prediction(), message_id)
      }

      case '/v' : {
        return youtube.search(query)
          .then(response => telegram.sendMessage(chat_id, response, message_id))
      }

      case '/w' : {
        return wiki.search(query)
          .then(response => telegram.sendMessage(chat_id, response, message_id))
      }

      case '/dice' : {
        return telegram.sendMessage(chat_id, dice.throwDice(parseInt(query, 10)), message_id, 'Markdown')
      }

      case '/p' : {
        return horoscope.getHoroscope(query)
          .then(result => telegram.sendMessage(chat_id, result, message_id))
      }
      case '/s' : {
        return weather.getWeather(query || 'Минск')
          .then(result => telegram.sendMessage(chat_id, result, message_id, 'Markdown'))
      }

      case '/all' : {
        return statistic.getChatStatistic(chat_id).then((result) => {
          const message = result.users.map(user =>
            `@${user.username}`).join(' ').concat('\n') + query
          return telegram.sendMessage(chat_id, message)
        })
      }

      case '/ps' : {
        return telegram.sendMessage(chat_id, puntoSwitcher(query), message_id)
      }

      default: {
        return Promise.resolve()
      }
    }
  } catch (e) {
    console.log(e) // eslint-disable-line
    return Promise.resolve()
  }
}

module.exports = { processQuery }
