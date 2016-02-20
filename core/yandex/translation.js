"use strict";
var request = require('request'),
    Q = require('q'),
    translationToken = process.env.TRANSLATION_APP_TOKEN || 'set_your_token';

var translation = {
    translateEngRu: function (textToTranslate, lang) {
        var options = {
                url: "https://translate.yandex.net/api/v1.5/tr.json/translate",
                qs: {
                    key: translationToken,
                    lang: lang || "en-ru",
                    text: textToTranslate
                }
            },
            deferred = Q.defer();

        request.post(options, function (err, response, body) {
            var data = JSON.parse(body);
            if (err || !data || !data.text || !data.text[0]) {
                return deferred.resolve("Error from translation service");
            }
            deferred.resolve(data.text[0]);
        }).on('error', function () {
            deferred.resolve("Error from translation service");
        });

        return deferred.promise;
    }
};

module.exports = translation;