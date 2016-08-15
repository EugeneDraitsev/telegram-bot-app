'use strict';
var express = require('express'),
    telegram = require('../core/telegram/telegram.js'),
    google = require('../core/google/search.js'),
    huiator = require('../core/text/huiator.js'),
    yasno = require('../core/text/yasno.js'),
    magic8ball = require('../core/stickers/magic8ball'),
    translation = require('../core/yandex/translation.js'),
    currency = require('../core/currency/currency.js'),
    statistic = require('../core/statistic/statistic'),
    ChatStatistic = require('../core/models/chat-statistic'),
    youtube = require('../core/google/youtube'),
    wiki = require('../core/wiki/wiki')
    _ = require('lodash'),
    router = express.Router();

router.post('/', function (req, res) {
    if (!req.body || !req.body.message || !req.body.message.chat || !req.body.message.message_id || !req.body.message.text) {
        res.statusCode = 200;
        res.end(null);
        return;
    }

    var telegramUpdate = req.body,
        telegramMessage = telegramUpdate.message.text,
        chat_id = telegramUpdate.message.chat.id,
        reply_to_message_id = telegramUpdate.message.message_id,
        user_info = telegramUpdate.message.from;

    statistic.updateStatistic(telegramMessage, user_info, chat_id);

    if (telegramMessage.lastIndexOf('/g', 0) === 0) {
        var query = parseQuery(telegramMessage);

        google.searchImage(query)
            .then(function (response) {
                telegram.sendPhoto(chat_id, response.image, reply_to_message_id, response.url);
            })
            .catch(function (error) {
                telegram.sendMessage(chat_id, error, reply_to_message_id);
            });
    }

    if (telegramMessage.lastIndexOf('/h', 0) === 0) {
        var textHuyator = parseQuery(telegramMessage),
            huext = huiator.huify(textHuyator);
        if (textHuyator === huext) {
            telegram.sendMessage(chat_id, "https://www.youtube.com/watch?v=q5bc4nmDNio", reply_to_message_id)
        } else {
            telegram.sendMessage(chat_id, huext, reply_to_message_id);
        }
    }

    if (telegramMessage.lastIndexOf('/y', 0) === 0) {
        var textYasnoficator = parseQuery(telegramMessage),
            yaext = yasno.yasnyfy(textYasnoficator);
        if (textYasnoficator !== yaext) {
            telegram.sendMessage(chat_id, yaext, reply_to_message_id);
        }
    }

    if (telegramMessage.lastIndexOf('/c', 0) === 0) {
        currency.getCurrency()
            .then(function (result) {
                var message = "Курсы валют:\n";
                _.mapKeys(result, function (val, key) {
                    message += key.toUpperCase() + ': ' + val + '\n';
                });
                telegram.sendMessage(chat_id, message, "");
            });
    }

    if (telegramMessage.lastIndexOf('/t') === 0) {
        var textTranslation = parseQuery(telegramMessage);

        translation.translateEngRu(textTranslation)
            .then(function (response) {
                telegram.sendMessage(chat_id, response, reply_to_message_id);
            });
    }

    if (telegramMessage.lastIndexOf('/s') === 0) {
        telegram.sendMessage(chat_id, statistic.allTimeStats(), '');
    }

    if (telegramMessage.lastIndexOf('/u') === 0) {
        telegram.sendMessage(chat_id, statistic.getUsersDayStatistic(chat_id), '');
    }

    if (telegramMessage.lastIndexOf('/z') === 0) {
        var chatStatistic = statistic.getChatStatistic(chat_id), message = 'User Statistic.';

        ChatStatistic.update({chat_id: chat_id}, {
            chat_id: chat_id,
            users: chatStatistic.users
        }, {upsert: true}, function (err) {
            if (err) {
                console.log('stat update error: ' + err);
            }
        });

        chatStatistic.users.sort(function (a, b) {
            return b.msgCount - a.msgCount;
        });

        var messagesCount = chatStatistic.users.reduce(function (a, b) {
            return a + b.msgCount;
        }, 0);

        message += '\nAll messages: ' + messagesCount;

        chatStatistic.users.forEach(function (a) {
            message += '\n' + a.msgCount + ' (' + (a.msgCount / messagesCount * 100).toFixed(2) + '%) - ' + a.username;
        }, 0);

        telegram.sendMessage(chat_id, message, '');
    }

    if (telegramMessage.lastIndexOf('/8', 0) === 0) {
        telegram.sendSticker(chat_id, magic8ball.prediction(), reply_to_message_id);
    }

    if (telegramMessage.lastIndexOf('/v', 0) === 0) {
        var youtubeQuery = parseQuery(telegramMessage);

        youtube.search(youtubeQuery)
            .then(function (response) {
                telegram.sendMessage(chat_id, response, reply_to_message_id);
            })
            .catch(function (err) {
                console.log(err);
            });
    }

    if (telegramMessage.lastIndexOf('/w', 0) === 0) {
        var searchQuery = parseQuery(telegramMessage)

        wiki.search(searchQuery)
            .then(function (response) {
                telegram.sendMessage(chat_id, response, reply_to_message_id)
            })
            .catch(function (err)) {
                console.log("Search couldn't be completed: " + err);
            });
    }

    res.statusCode = 200;
    res.end(null);
});

function parseQuery(query) {
    return query.replace(/\/\S+\s*/g, '').trim();
}

module.exports = router;