'use strict'
const rp = require('request-promise')
const botToken = process.env.TOKEN || 'your_token_here'
const BASE_URL = `https://api.telegram.org/bot${botToken}`

function sendMessage(chat_id, text, reply_to_message_id, parse_mode) {
  //fucking slow aws. waiting for node 6.0
  const formData = {chat_id, reply_to_message_id: reply_to_message_id || '', text, parse_mode: parse_mode || ''}

  return rp.post({url: `${BASE_URL}/sendMessage`, formData})
}

function sendPhoto(chat_id, photo, reply_to_message_id, picUrl) {
  const formData = {
    chat_id,
    reply_to_message_id: reply_to_message_id || '',
    photo: {
      value: photo,
      options: {
        contentType: 'image/png',
        filename: 'image.png'
      }
    }
  }

  return rp.post({url: `${BASE_URL}/sendPhoto`, formData})
    .catch(() => sendMessage(chat_id, `I can't load this pic to telegram: ${picUrl}`, reply_to_message_id))
}

function sendSticker(chat_id, sticker, reply_to_message_id) {
  const formData = {chat_id, reply_to_message_id: reply_to_message_id || '', sticker}
  return rp.post({url: `${BASE_URL}/sendSticker`, formData})
}

module.exports = {sendMessage, sendPhoto, sendSticker}