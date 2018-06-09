// tslint:disable-next-line
const AWSXRay = require('aws-xray-sdk')

import { segments } from '../'
import {
  getCurrency,
  getFormattedChatStatistic,
  getHoroscope,
  getPrediction,
  getUsersList,
  getWeather,
  huify,
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
export const findCommand = (text: string) => COMMANDS.find(command => text.replace(/ .*/, '') === command
  || text.replace(/@.*/, '') === command)

export function processQuery(text: string, message_id: string, chat_id: string, replyText: string) {
  const query = parseQuery(text) || replyText
  const command = findCommand(text)
  const { commandSegment } = segments
  segments.querySegment = new AWSXRay.Segment(command || 'no-command', commandSegment.trace_id, commandSegment.id)

  try {
    switch (command) {
      case '/g' : {
        return searchImage(query)
          .then(response => sendPhoto(chat_id, response.image, response.url, message_id))
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
        return getFormattedChatStatistic(chat_id)
          .then(message => sendMessage(chat_id, message, message_id))
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
          .then(result => sendMessage(chat_id, result, message_id, 'Markdown'))
          .catch(error => sendMessage(chat_id, error, message_id))
      }
      case '/s' : {
        return getWeather(query || 'Минск')
          .then(result => sendMessage(chat_id, result, message_id, 'Markdown'))
      }

      case '/all' : {
        return getUsersList(chat_id, query)
          .then(response => sendMessage(chat_id, response, message_id))
      }

      case '/ps' : {
        return sendMessage(chat_id, puntoSwitcher(query), message_id)
      }

      default: {
        return Promise.resolve() as any
      }
    }
  } catch (e) {
    console.log(e) // tslint:disable-line
    return Promise.resolve()
  }
}
