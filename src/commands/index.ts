import * as AWSXRay from 'aws-xray-sdk'

import { segments } from '../'
import {
  getCurrency,
  getFormattedChatStatistics,
  getHoroscope,
  getPrediction,
  getUsersList,
  getWeather,
  getXRayStats,
  huify,
  puntoSwitcher,
  searchImage,
  searchWiki,
  searchYoutube,
  sendDocument,
  sendMessage,
  sendPhoto,
  sendSticker,
  sendVideo,
  shrugyfy,
  throwDice,
  translate,
  yasnyfy,
} from '../core'

// tslint:disable-next-line:max-line-length
const COMMANDS = ['/ps', '/g', '/h', '/y', '/c', '/t', '/z', '/8', '/v', '/w', '/dice', '/all', '/p', '/f', '/s', '/x', '/remont', '/shrug']

const parseQuery = (query: string = '') => query.replace(/\/\S+\s*/g, '').trim()
export const findCommand = (text: string) => COMMANDS.find(command => text.replace(/ .*/, '') === command
  || text.replace(/@.*/, '') === command)

export async function processQuery(text: string, message_id: string, chat_id: string, reply_to_message: any) {
  const query = parseQuery(text) || reply_to_message.text
  const command = findCommand(text)
  const { commandSegment } = segments
  const replyId = reply_to_message.message_id || message_id
  segments.querySegment = new AWSXRay.Segment(command || 'no-command', commandSegment.trace_id, commandSegment.id)

  try {
    switch (command) {
      case '/g' : {
        return searchImage(query)
          .then(response => sendPhoto({
            chat_id,
            photo: response.image,
            picUrl: response.url,
            reply_to_message_id: replyId,
          }))
          .catch(error => sendMessage(chat_id, error, replyId))
      }
      case '/h': {
        const huext = huify(query)
        return query === huext ?
          sendMessage(chat_id, 'https://www.youtube.com/watch?v=q5bc4nmDNio', replyId) :
          sendMessage(chat_id, huext, replyId)
      }
      case '/y': {
        return sendMessage(chat_id, yasnyfy(query, String(new Date().getFullYear())), replyId)
      }
      case '/c': {
        return getCurrency()
          .then(result => sendMessage(chat_id, result))
      }
      case '/t': {
        return translate(query)
          .then(response => sendMessage(chat_id, response, replyId))
      }
      case '/z': {
        return getFormattedChatStatistics(chat_id, segments.querySegment)
          .then(message => sendMessage(chat_id, message))
      }
      case '/8': {
        return sendSticker(chat_id, String(getPrediction()), replyId)
      }
      case '/v' : {
        return searchYoutube(query)
          .then(response => sendMessage(chat_id, response, replyId))
      }
      case '/w' : {
        return searchWiki(query)
          .then(response => sendMessage(chat_id, response, replyId))
      }
      case '/dice' : {
        return sendMessage(chat_id, throwDice(parseInt(query, 10) || 6), message_id, 'Markdown')
      }
      case '/p' : {
        return getHoroscope(query)
          .then(result => sendMessage(chat_id, result, replyId, 'HTML'))
          .catch(error => sendMessage(chat_id, error, replyId))
      }
      case '/f' : {
        return getWeather(query || 'Минск')
          .then(result => sendMessage(chat_id, result, replyId, 'Markdown'))
      }
      case '/all' : {
        return getUsersList(chat_id, query, segments.querySegment)
          .then(response => sendMessage(chat_id, response, replyId))
      }
      case '/ps' : {
        return sendMessage(chat_id, puntoSwitcher(query), replyId)
      }
      case '/remont' : {
        return sendVideo(chat_id, replyId)
      }
      case '/x': {
        return getXRayStats(segments.querySegment)
          .then(response => sendDocument({
            chat_id,
            caption: `Browser version available <a href="${response.url}">here</a>`,
            parse_mode: 'HTML',
            document: response.image,
            reply_to_message_id: message_id,
          }))
          .catch(error => sendMessage(chat_id, error))
      }
      case '/shrug' : {
        return sendMessage(chat_id, shrugyfy(), replyId, 'Markdown')
      }
      default: {
        return null
      }
    }
  } catch (e) {
    console.log(e) // tslint:disable-line
    segments.querySegment.addError(e)
    return Promise.resolve()
  } finally {
    segments.querySegment.close()
  }
}
