'use strict';

var separator = /[\s.,?!]/,
    mainContainer = {};

var statistic = {
    allTimeStats: function () {
        var text = 'Most popular words:\n',
            keys = Object.keys(mainContainer);

        keys.sort(compareCount);
        //TODO remove min size of statistics
        if (keys.length > 10) {
            for (var i = 0; i < 10; i++) {
                text += keys[i] + ':' + mainContainer[keys[i]] + '\n'
            }
        } else {
            text = 'Мало слов для выборки';
        }

        function compareCount(a, b) {
            return mainContainer[b] - mainContainer[a];
        }

        return text;
    },
    takeMsg: function (msg) {
        splitString(msg, separator).forEach(function (word) {
            if (word.length > 2) {
                mainContainer[word] = word in mainContainer ? mainContainer[word] + 1 : 1;
            }
        });
    }
};

function splitString(stringToSplit, separator) {
    return stringToSplit.split(separator)
}

module.exports = statistic;