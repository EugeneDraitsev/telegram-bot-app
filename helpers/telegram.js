'use strict';
var https = require('https'),
    querystring = require('querystring'),
    request = require('request'),
    botToken = process.env.TOKEN || "your_token_here";

var telegram = {
    sendMessage: function (chat_id, text, reply_to_message_id) {
        var formData = {
            chat_id: chat_id,
            reply_to_message_id: reply_to_message_id,
            text: text
        };

        request.post({
            url: 'https://api.telegram.org/bot' + botToken + '/sendMessage',
            formData: formData
        });
    },

    sendPhoto: function (chat_id, photo, reply_to_message_id, picUrl) {
        var formData = {
            chat_id: chat_id,
            reply_to_message_id: reply_to_message_id,
            photo: {
                value: photo,
                options: {
                    contentType: 'image/jpeg'
                }
            }
        };

        request.post({
            url: 'https://api.telegram.org/bot' + botToken + '/sendPhoto',
            formData: formData
        }, function optionalCallback(err, httpResponse, body) {
            if (body.indexOf('\"ok\":true') < 0) {
                telegram.sendMessage(chat_id, 'I can\'t load this pic to telegram: ' + picUrl, reply_to_message_id)
            }
        });
    }
};

module.exports = telegram;
