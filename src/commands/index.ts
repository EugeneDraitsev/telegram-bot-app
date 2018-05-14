import { orderBy } from 'lodash'
import {
  getChatStatistic,
  getCurrency,
  getHoroscope,
  getPrediction,
  getWeather,
  huify,
  IChatStat,
  puntoSwitcher,
  searchImage,
  searchWiki,
  searchYoutube,
  sendMessage,
  sendPhoto,
  sendSticker,
  throwDice,
  translate,
  yasnyfy,
} from '../core'

const COMMANDS = ['/ps', '/g', '/h', '/y', '/c', '/t', '/z', '/8', '/v', '/w', '/dice', '/all', '/p', '/s']

const parseQuery = (query: string) => query.replace(/\/\S+\s*/g, '').trim()
const findCommand = (text: string) => COMMANDS.filter(command => !text.lastIndexOf(command))[0]

export function processQuery(text: string, message_id: string, chat_id: string, replyText: string) {
  const query = parseQuery(text) || replyText
  try {
    switch (findCommand(text)) {
      case '/g' : {
        return searchImage(query)
          .then(response => sendPhoto(chat_id, response.image, message_id, response.url))
          .catch(error => sendMessage(chat_id, error, message_id))
      }

      case '/h': {
        const huext = huify(query)
        return query === huext ?
          sendMessage(chat_id, 'https://www.youtube.com/watch?v=q5bc4nmDNio', message_id) :
          sendMessage(chat_id, huext, message_id)
      }

      case '/y': {
        return sendMessage(chat_id, yasnyfy(query), message_id)
      }

      case '/c': {
        return getCurrency()
          .then(result => sendMessage(chat_id, result))
      }

      case '/t': {
        return translate(query)
          .then(response => sendMessage(chat_id, response, message_id))
      }

      case '/z': {
        return getChatStatistic(chat_id).then((result: IChatStat) => {
          const stats = orderBy(result.users, 'msgCount', 'desc')
          const messagesCount = stats.reduce((a, b) => a + b.msgCount, 0)
          const message = `User Statistic.\nAll messages: ${messagesCount}\n${stats.map(user =>
            `${user.msgCount} (${((user.msgCount / messagesCount) * 100).toFixed(2)}%) - ${user.username}`).join('\n')}`
          return sendMessage(chat_id, message)
        })
      }

      case '/8': {
        return sendSticker(chat_id, String(getPrediction()), message_id)
      }

      case '/v' : {
        return searchYoutube(query)
          .then(response => sendMessage(chat_id, response, message_id))
      }

      case '/w' : {
        return searchWiki(query)
          .then(response => sendMessage(chat_id, response, message_id))
      }

      case '/dice' : {
        return sendMessage(chat_id, throwDice(parseInt(query, 10) || 6), message_id, 'Markdown')
      }

      case '/p' : {
        return getHoroscope(query)
          .then(result => sendMessage(chat_id, result, message_id))
      }
      case '/s' : {
        return getWeather(query || 'Минск')
          .then(result => sendMessage(chat_id, result, message_id, 'Markdown'))
      }

      case '/all' : {
        return getChatStatistic(chat_id).then((result: IChatStat) => {
          const message = result.users.map(user =>
            `@${user.username}`).join(' ').concat('\n') + query
          return sendMessage(chat_id, message)
        })
      }

      case '/ps' : {
        return sendMessage(chat_id, puntoSwitcher(query), message_id)
      }

      default: {
        return Promise.resolve()
      }
    }
  } catch (e) {
    console.log(e) // tslint:disable-line
    return Promise.resolve()
  }
}
