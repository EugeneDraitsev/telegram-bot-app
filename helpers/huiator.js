'use strict';

var huiator = {
    len: 3,
    huify: function (text) {
        var pattword = /[А-Я0-9]+/ig;
        text = text.replace(pattword, huiator.huifyWord);
        return text;
    },

    huifyWord: function (word) {
        var soglasn = '[бвгджзклмнпрстфхчцшщ]';
        var patt1 = new RegExp('^' + soglasn + '*[оеёэ].?', 'i'); //слова, в которых после согласных идут "о","е","ё","э" (или начинаются с них)
        var patt2 = new RegExp('^' + soglasn + '*[ую].?', 'i'); //слова, в которых после согласных идут "у" и "ю" (или начинаются с них)
        var patt3 = new RegExp('^' + soglasn + '*[ая].?', 'i'); //слова, в которых после согласных идут "а" и "я" (или начинаются с них)
        var patt4 = new RegExp('^' + soglasn + '*[иы].?', 'i'); //слова, в которых после согласных идут "и" и "ы" (или начинаются с них)
        var re = new RegExp('^' + soglasn + '*.', 'i');
        if (patt1.test(word) && word.length >= len) {
            word = word.replace(re, 'хуе');
            return word;
        }
        if (patt2.test(word) && word.length >= len) {
            word = word.replace(re, 'хую');
            return word;
        }
        if (patt3.test(word) && word.length >= len) {
            word = word.replace(re, 'хуя');
            return word;
        }
        if (patt4.test(word) && word.length >= len) {
            word = word.replace(re, 'хуи');
            return word;
        }
        return word;
    }
};
module.exports = huiator;

