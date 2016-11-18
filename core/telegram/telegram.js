'use strict';
var request = require('request'),
    botToken = process.env.TOKEN || "your_token_here";

var telegram = {
    sendMessage: function (chat_id, text, reply_to_message_id) {
        var formData = {
            chat_id: chat_id,
            reply_to_message_id: reply_to_message_id,
            parse_mode: 'Markdown',
            text: text
        };

        request.post({
            url: 'https://api.telegram.org/bot' + botToken + '/sendMessage',
            formData: formData
        }).on('error', function (e) {
            console.log('ERROR send message:' + e);
        });
    },

    sendPhoto: function (chat_id, photo, reply_to_message_id, picUrl) {
        var formData = {
            chat_id: chat_id,
            reply_to_message_id: reply_to_message_id,
            photo: {
                value: photo,
                options: {
                    contentType: 'image/png',
                    filename: 'image.png'
                }
            }
        };

        request.post({
            url: 'https://api.telegram.org/bot' + botToken + '/sendPhoto',
            formData: formData
        }, function (err, httpResponse, body) {
            if (!body || body.indexOf('\"ok\":true') < 0) {
                telegram.sendMessage(chat_id, 'I can\'t load this pic to telegram: ' + picUrl, reply_to_message_id)
            }
        }).on('error', function (e) {
            console.log('ERROR posting image:' + e);
        });
    },

    sendSticker: function (chat_id, sticker, reply_to_message_id) {
        var formData = {
            chat_id: chat_id,
            reply_to_message_id: reply_to_message_id,
            sticker: sticker
        };

        request.post({
            url: 'https://api.telegram.org/bot' + botToken + '/sendSticker',
            formData: formData
        }).on('error', function (e) {
            console.log('ERROR send sticker:' + e);
        });
    }
};

module.exports = telegram;