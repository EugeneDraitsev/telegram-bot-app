var express = require('express');
var telegram = require('../helpers/telegram.js');
var google = require('../helpers/google.js');
var huiator = require('../helpers/huiator.js');
var _ = require('underscore');
var router = express.Router();

router.post('/', function (req, res, next) {
    if (!req.body.message.text) {
        res.statusCode = 200;
        res.end();
        return;
    }

    var telegramUpdate = req.body,
        telegramMessage = telegramUpdate.message.text,
        chat_id = telegramUpdate.message.chat.id,
        reply_to_message_id = telegramUpdate.message.message_id;


    if (telegramMessage.lastIndexOf('/g', 0) === 0) {
        //var query = telegramMessage.replace('/g', '');
        var query = telegramMessage.replace(telegramMessage.split(' ')[0], '');

        google.search(query, function imageCallback(message, isPhoto, contentType, url) {
            if (isPhoto) {
                telegram.sendPhoto(chat_id, message, reply_to_message_id, contentType, url);
            }
            else {
                telegram.sendMessage(chat_id, message, reply_to_message_id);
            }
        });
    }

    if (telegramMessage.lastIndexOf('/h', 0) === 0) {
        var text = telegramMessage.replace(telegramMessage.split(' ')[0], '').trim(),
            huext = huiator(text);
        if (text === huext) {
            telegram.sendMessage(chat_id, "https://www.youtube.com/watch?v=q5bc4nmDNio", reply_to_message_id)
        } else {
            telegram.sendMessage(chat_id, huext, reply_to_message_id);
        }
    }

    // Send response to Telegram, always OK
    res.statusCode = 200;
    res.end();
});

module.exports = router;
