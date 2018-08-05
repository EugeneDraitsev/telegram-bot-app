import * as FormData from 'form-data'
import fetch from 'node-fetch'

const AWSXRay = require('aws-xray-sdk') // tslint:disable-line

import { segments } from '../'

interface ISendPhotoParams {
  chat_id: string | number,
  photo: Buffer,
  picUrl?: string,
  reply_to_message_id?: string,
}

interface ISendDocumentParams {
  chat_id: string | number,
  document: Buffer,
  picUrl?: string,
  reply_to_message_id?: string,
  parse_mode?: string,
  caption?: string,
}

const botToken = process.env.TOKEN || 'your_token_here'
const BASE_URL = `https://api.telegram.org/bot${botToken}`

const openSegment = (name: string) => {
  const { trace_id, id } = segments.querySegment
  return new AWSXRay.Segment(name, trace_id, id)
}

export function sendMessage(chat_id: string | number, text: string, reply_to_message_id = '', parse_mode = '') {
  const segment = openSegment('tg-send-message')
  const body = new FormData()
  body.append('chat_id', chat_id)
  body.append('reply_to_message_id', reply_to_message_id)
  body.append('text', text)
  body.append('parse_mode', parse_mode)

  return fetch(`${BASE_URL}/sendMessage`, { body, method: 'POST' })
    .catch((e) => {
      segment.addError(e)
      segments.commandSegment.addError(e)
    })
    .then(() => segment.close())
}

export function sendPhoto(options: ISendPhotoParams) {
  const segment = openSegment('tg-send-photo')
  const {
    chat_id,
    photo,
    reply_to_message_id,
    picUrl,
  } = options

  const body = new FormData()
  body.append('chat_id', chat_id)
  body.append('photo', photo, { contentType: 'image/png', filename: 'image.png' })

  if (reply_to_message_id) {
    body.append('reply_to_message_id', reply_to_message_id)
  }

  return fetch(`${BASE_URL}/sendPhoto`, { body, method: 'POST' })
    .then(res => res.status > 200 ? Promise.reject(res) : Promise.resolve(res))
    .catch(() => {
      if (!picUrl) {
        return sendMessage(chat_id, 'I can\'t load image to telegram', reply_to_message_id)
      }
      return sendMessage(chat_id, `I can't load this pic to telegram: ${picUrl}`, reply_to_message_id)
    })
    .catch((e) => {
      segment.addError(e)
      segments.commandSegment.addError(e)
    })
    .then(() => segment.close())
}

export function sendDocument(options: ISendDocumentParams) {
  const segment = openSegment('tg-send-document')
  const {
    chat_id,
    document,
    reply_to_message_id,
    picUrl,
    caption,
    parse_mode,
  } = options

  const body = new FormData()
  body.append('chat_id', chat_id)
  body.append('document', document, { contentType: 'image/png', filename: 'image.png' })

  if (reply_to_message_id) {
    body.append('reply_to_message_id', reply_to_message_id)
  }

  if (parse_mode) {
    body.append('parse_mode', parse_mode)
  }

  if (caption) {
    body.append('caption', caption)
  }

  return fetch(`${BASE_URL}/sendDocument`, { body, method: 'POST' })
    .then(res => res.status > 200 ? Promise.reject(res) : Promise.resolve(res))
    .catch(() => {
      if (!picUrl) {
        return sendMessage(chat_id, 'I can\'t load image to telegram', reply_to_message_id)
      }
      return sendMessage(chat_id, `I can't load this pic to telegram: ${picUrl}`, reply_to_message_id)
    })
    .catch((e) => {
      segment.addError(e)
      segments.commandSegment.addError(e)
    })
    .then(() => segment.close())
}

export function sendSticker(chat_id: string, sticker: string, reply_to_message_id = '') {
  const segment = openSegment('tg-send-sticker')
  const body = new FormData()
  body.append('chat_id', chat_id)
  body.append('sticker', sticker)
  body.append('reply_to_message_id', reply_to_message_id)
  return fetch(`${BASE_URL}/sendSticker`, { body, method: 'POST' })
    .catch((e) => {
      segment.addError(e)
      segments.commandSegment.addError(e)
    })
    .then(() => segment.close())
}
