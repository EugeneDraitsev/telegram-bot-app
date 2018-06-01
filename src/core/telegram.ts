import * as FormData from 'form-data'
import fetch from 'node-fetch'

const botToken = process.env.TOKEN || 'your_token_here'
const BASE_URL = `https://api.telegram.org/bot${botToken}`

export function sendMessage(chat_id: string | number, text: string, reply_to_message_id = '', parse_mode = '') {
  const body = new FormData()
  body.append('chat_id', chat_id)
  body.append('reply_to_message_id', reply_to_message_id)
  body.append('text', text)
  body.append('parse_mode', parse_mode)

  return fetch(`${BASE_URL}/sendMessage`, { body, method: 'POST' })
}

export function sendPhoto(chat_id: string | number, photo: Buffer, picUrl: string, reply_to_message_id = '') {
  const body = new FormData()
  body.append('chat_id', chat_id)
  body.append('photo', photo, { contentType: 'image/png', filename: 'image.png' })
  body.append('reply_to_message_id', reply_to_message_id)

  return fetch(`${BASE_URL}/sendPhoto`, { body, method: 'POST' })
    .then(res => res.status > 200 ? Promise.reject(res) : Promise.resolve(res))
    .catch(() => sendMessage(chat_id, `I can't load this pic to telegram: ${picUrl}`, reply_to_message_id))
}

export function sendSticker(chat_id: string, sticker: string, reply_to_message_id = '') {
  const body = new FormData()
  body.append('chat_id', chat_id)
  body.append('sticker', sticker)
  body.append('reply_to_message_id', reply_to_message_id)
  return fetch(`${BASE_URL}/sendSticker`, { body, method: 'POST' })
}
