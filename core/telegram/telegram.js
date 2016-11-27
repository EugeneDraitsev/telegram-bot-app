'use strict'
const rp = require('request-promise')
const botToken = process.env.TOKEN || 'your_token_here'

const telegram = {
  sendMessage: function (chat_id, text, reply_to_message_id, parse_mode) {
    //fucking slow aws. waiting for node 6.0
    const formData = {chat_id, reply_to_message_id: reply_to_message_id || '', text, parse_mode: parse_mode || ''}

    return rp.post({url: `https://api.telegram.org/bot${botToken}/sendMessage`, formData})
      .catch(err => console.log(`ERROR send message: ${err}`))
  },

  sendPhoto: function (chat_id, photo, reply_to_message_id, picUrl) {
    const formData = {
      chat_id,
      reply_to_message_id,
      photo: {
        value: photo,
        options: {
          contentType: 'image/png',
          filename: 'image.png'
        }
      }
    };

    return rp.post({url: `https://api.telegram.org/bot${botToken}/sendPhoto`, formData})
      .catch(err => telegram.sendMessage(chat_id, `I can't load this pic to telegram: ${picUrl}`, reply_to_message_id))
  },

  sendSticker: function (chat_id, sticker, reply_to_message_id) {
    const formData = {chat_id, reply_to_message_id, sticker}
    return rp.post({url: `https://api.telegram.org/bot${botToken}/sendSticker`, formData})
      .catch(err => console.log(`ERROR send sticker: ${err}`))
  }
}

module.exports = telegram;