'use strict';
var express = require('express'),
    telegram = require('../helpers/telegram.js'),
    google = require('../helpers/google.js'),
    huiator = require('../helpers/huiator.js'),
    imageService = require('../helpers/image.js'),
    router = express.Router(),
    yasno = require('../helpers/yasno.js');

router.post('/', function (req, res) {
    if (!req.body || !req.body.message || !req.body.message.chat || !req.body.message.message_id || !req.body.message.text) {
        res.statusCode = 200;
        res.end(null);
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
        var textHuyator = telegramMessage.replace(telegramMessage.split(' ')[0], '').trim(),
            huext = huiator.huify(textHuyator);
        if (textHuyator === huext) {
            telegram.sendMessage(chat_id, "https://www.youtube.com/watch?v=q5bc4nmDNio", reply_to_message_id)
        } else {
            telegram.sendMessage(chat_id, huext, reply_to_message_id);
        }
    }

    if (telegramMessage.lastIndexOf('/y', 0) === 0) {
        var textYasnoficator = telegramMessage.replace(telegramMessage.split(' ')[0], '').trim(),
            yaext = yasno.yasnyfy(textYasnoficator);
        if (textYasnoficator !== yaext) {
            telegram.sendMessage(chat_id, yaext, reply_to_message_id);
        }
    }

    if (telegramMessage.lastIndexOf('/c', 0) === 0) {
        imageService.getImage(function (image) {
            telegram.sendPhoto(chat_id, image, reply_to_message_id);
        });
    }

    res.statusCode = 200;
    res.end(null);
});

module.exports = router;