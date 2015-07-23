var TRANSLATION_MODULE = (function() {
    "use strict"
    var request = require('request');

    return {
        translate: function(textToTranslate, callback, lang) {
            var options = {
                url: "https://translate.yandex.net/api/v1.5/tr.json/translate",
                qs: {
                    key: process.env.TRANSLATION_APP_TOKEN,
                    lang: lang || "en-ru",
                    text: textToTranslate
                }
            };

            request.post(options, function(err, response, body) {
                if (err) {
                    callback("Error from translation service");
                }
                callback("", JSON.parse(body).text[0]);
            });
        }
    };
}());

module.exports = TRANSLATION_MODULE;