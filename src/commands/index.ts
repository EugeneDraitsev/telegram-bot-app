import * as AWSXRay from 'aws-xray-sdk'
import { random } from 'lodash'

import { segments } from '../handler'
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
  sayThanksForYaLink,
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

const COMMANDS = ['/ps', '/g', '/h', '/y', '/c', '/t', '/z', '/8', '/v',
  '/w', '/dice', '/all', '/p', '/f', '/s', '/x', '/remont', '/shrug']

export const parseQuery = (query: string = '') =>
  query.replace(/\/\S+\s*/g, '').trim()

export const findCommand = (text: string) => COMMANDS.find(command => text.replace(/ .*/, '') === command
  || text.replace(/@.*/, '') === command)

export const isYaMusicLink = (text: string) => text.includes('://music.yandex.')

export async function processQuery(text: string, message_id: string, chat_id: string, reply_to_message: any) {
  const parsedText = parseQuery(text)
  const query = parsedText || parseQuery(reply_to_message.text)
  const command = findCommand(text)
  const { commandSegment } = segments
  const replyId = parsedText ? message_id : reply_to_message.message_id || message_id
  segments.querySegment = new AWSXRay.Segment(command || 'no-command', commandSegment.trace_id, commandSegment.id)

  if (isYaMusicLink(text) && random(0, 100) > 85) {
    sendMessage(chat_id, sayThanksForYaLink(), replyId)
  }

  try {
    switch (command) {
      case '/g': {
        try {
          const response = await searchImage(query)
          return sendPhoto({ chat_id, photo: response.image, picUrl: response.url, reply_to_message_id: replyId })
        } catch (e) {
          return sendMessage(chat_id, e.message, replyId)
        }
      }
      case '/h': {
        const huext = huify(query)
        const result = query === huext ? 'https://www.youtube.com/watch?v=q5bc4nmDNio' : huext
        return sendMessage(chat_id, result, replyId)
      }
      case '/y': {
        const yasno = yasnyfy(query, String(new Date().getFullYear()))
        return sendMessage(chat_id, yasno, replyId)
      }
      case '/c': {
        const currency = await getCurrency()
        return sendMessage(chat_id, currency)
      }
      case '/t': {
        const translated = await translate(query)
        return sendMessage(chat_id, translated, replyId)
      }
      case '/z': {
        const stats = await getFormattedChatStatistics(chat_id, segments.querySegment)
        return sendMessage(chat_id, stats)
      }
      case '/s': {
        return sendMessage(
          chat_id,
          `Last 24h chat statistics: https://telegram-bot-ui.surge.sh/chat/${chat_id}`,
          replyId,
          'HTML',
        )
      }
      case '/8': {
        return sendSticker(chat_id, getPrediction()!, replyId)
      }
      case '/v': {
        const link = await searchYoutube(query)
        return sendMessage(chat_id, link, replyId)
      }
      case '/w': {
        const link = await searchWiki(query)
        return sendMessage(chat_id, link, replyId)
      }
      case '/dice': {
        const dice = throwDice(parseInt(query, 10) || 6)
        return sendMessage(chat_id, dice, message_id, 'Markdown')
      }
      case '/p': {
        const prediction = await getHoroscope(query)
        return sendMessage(chat_id, prediction, replyId, 'HTML')
      }
      case '/f': {
        const weather = await getWeather(query || 'Минск')
        return sendMessage(chat_id, weather, message_id, 'Markdown')
      }
      case '/all': {
        const users = await getUsersList(chat_id, query, segments.querySegment)
        return sendMessage(chat_id, users, replyId)
      }
      case '/ps': {
        return sendMessage(chat_id, puntoSwitcher(query), replyId)
      }
      case '/remont': {
        return sendVideo(chat_id, replyId)
      }
      case '/x': {
        return getXRayStats(segments.querySegment)
          .then(xRayStats => sendDocument({
            chat_id,
            caption: `Browser version available <a href="${xRayStats.url}">here</a>`,
            parse_mode: 'HTML',
            document: xRayStats.image,
            reply_to_message_id: message_id,
          }))
          .catch(error => sendMessage(chat_id, error))
      }
      case '/shrug': {
        return sendMessage(chat_id, shrugyfy(), replyId, 'Markdown')
      }
      default: {
        return null
      }
    }
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    segments.querySegment.addError(e)
    return Promise.resolve()
  } finally {
    segments.querySegment.close()
  }
}
