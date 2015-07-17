'use strict';
var express = require('express'),
    telegram = require('../helpers/telegram.js'),
    google = require('../helpers/google.js'),
    huiator = require('../helpers/huiator.js'),
    router = express.Router();

router.post('/', function (req, res) {
    if (!req.body || !req.body.message || !req.body.message.chat || !req.body.message.message_id || !req.body.message.text) {
        res.statusCode = 501; //not implemented
        res.end();
        return;
    }

    var telegramUpdate = req.body,
        telegramMessage = telegramUpdate.message.text,
        chat_id = telegramUpdate.message.chat.id,
        reply_to_message_id = telegramUpdate.message.message_id;


    if (telegramMessage.lastIndexOf('/g', 0) === 0) {
        var query = telegramMessage.replace(telegramMessage.split(' ')[0], '');

        google.search(query, function imageCallback(message, isPhoto, tabUrl) {
            if (isPhoto) {
                telegram.sendPhoto(chat_id, message, reply_to_message_id, tabUrl);
            }
            else {
                telegram.sendMessage(chat_id, message, reply_to_message_id);
            }
        });
    }

    if (telegramMessage.lastIndexOf('/h', 0) === 0) {
        var text = telegramMessage.replace(telegramMessage.split(' ')[0], '').trim(),
            huext = huiator.huify(text);
        if (text === huext) {
            telegram.sendMessage(chat_id, "https://www.youtube.com/watch?v=q5bc4nmDNio", reply_to_message_id)
        } else {
            telegram.sendMessage(chat_id, huext, reply_to_message_id);
        }
    }

    res.statusCode = 200;
    res.end();
});

module.exports = router;
