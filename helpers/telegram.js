'use strict';
var https = require('https'),
    querystring = require('querystring'),
    request = require('request'),
    botToken = process.env.TOKEN || "your_token_here";

var telegram = {
    sendMessage: function (chat_id, text, reply_to_message_id) {

        // Send the chat id, message to reply to, and the message to send
        var telegramRequestData = querystring.stringify({
            chat_id: chat_id,
            text: text,
            reply_to_message_id: reply_to_message_id
        });

        // Define the POST request
        var telegramRequestOptions = {
            host: 'api.telegram.org',
            port: 443,
            path: '/bot' + botToken + '/sendMessage',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': telegramRequestData.length
            }
        };

        // Execute the request
        var telegramRequest = https.request(telegramRequestOptions, function (telegramResponse) {
            telegramResponse.setEncoding('utf8');

            // Read the response (not used right now, but you can log this to see what's happening)
            var output = '';
            telegramResponse.on('data', function (chunk) {
                output += chunk;
            });

        });

        // Send the data
        telegramRequest.write(telegramRequestData);

        // Done
        telegramRequest.end();
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
