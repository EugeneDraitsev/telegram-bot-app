'use strict';

var separator = /[\s.,]/,
    mainContainer = {};

var container = {
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
module.exports = container;