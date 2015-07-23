"use strict";
var request = require('request'),
    translationToken = process.env.TRANSLATION_APP_TOKEN || 'set_your_token';

var translation = {
    translateEngRu: function (textToTranslate, callback, lang) {
        var options = {
            url: "https://translate.yandex.net/api/v1.5/tr.json/translate",
            qs: {
                key: translationToken,
                lang: lang || "en-ru",
                text: textToTranslate
            }
        };

        request.post(options, function (err, response, body) {
            if (err) {
                callback("Error from translation service");
            }
            callback("", JSON.parse(body).text[0]);
        });

    }
};

module.exports = translation;