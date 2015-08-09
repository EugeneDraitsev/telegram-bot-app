'use strict';

var separator = /[\s.,]/,
    mainContainer = {};


var statistic = {
    allTimeStats: function (container) {
        var text = 'Most popular words:\n',
            keys = Object.keys(container);

        keys.sort(compareCount);

        for (var i = 0; i < 10; i++) {
            text += keys[i] + ':' + container[keys[i]] + '\n'
        }

        function compareCount(a, b) {
            return container[b] - container[a];
        }
        return text;
    },
    takeMsg: function (msg) {
        var tempArr = splitString(msg, separator);

        tempArr.forEach(function (word) {
            if (word.length > 2) {
                mainContainer[word] = word in mainContainer ? mainContainer[word] + 1 : 1;
            }
        });
    },
    getContainer: function () {
        return mainContainer;
    }
};

function splitString(stringToSplit, separator) {
    return stringToSplit.split(separator)
}

module.exports = statistic;