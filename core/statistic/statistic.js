'use strict';

var moment = require('moment'),
    separator = /[\s.,?!]/,
    mainContainer = {},
    usersContainerDay = {},
    startTime = moment().add(3, 'h').format('lll');

var statistic = {
    allTimeStats: allTimeStats,
    takeMsg: takeMsg,
    takeUserInfo: takeUserInfo,
    clearUsersDayStatistic: clearUsersDayStatistic,
    getUsersDayStatistic: getUsersDayStatistic
};

function allTimeStats() {
    var text = 'Most popular words:\n',
        keys = Object.keys(mainContainer),
        amount = keys.length > 10 ? 10 : keys.length;
    keys.sort(compareCount);
    for (var i = 0; i < amount; i++) {
        text += keys[i] + ' : ' + mainContainer[keys[i]] + '\n'
    }
    return text;
}

function takeMsg(msg) {
    splitString(msg, separator).forEach(function (word) {
        if (word.length > 2) {
            mainContainer[word] = word in mainContainer ? mainContainer[word] + 1 : 1;
        }
    });
}

function takeUserInfo(user_info, chat_id) {
    if (!(chat_id in usersContainerDay)) {
        usersContainerDay[chat_id] = {};
    }

    if (user_info.id in usersContainerDay[chat_id]) {
        usersContainerDay[chat_id][user_info.id].msgCount += 1;
    } else {
        usersContainerDay[chat_id][user_info.id] = {
            username: user_info.username,
            msgCount: 1
        }
    }
}

function clearUsersDayStatistic() {
    usersContainerDay = {};
}

function getUsersDayStatistic(chat_id) {
    var msgAmount = 0,
        msg = 'Users messages statistic\nfrom ' + startTime + '\nto ' + moment().add(3, 'h').format('lll') + ':\n',
        result = [];
    if (usersContainerDay && usersContainerDay[chat_id]) {
        for (var a in usersContainerDay[chat_id]) {
            msgAmount += usersContainerDay[chat_id][a].msgCount;
            result.push({
                username: usersContainerDay[chat_id][a].username,
                msgCount: usersContainerDay[chat_id][a].msgCount
            })
        }
        result.sort(function(a,b){
            return b.msgCount - a.msgCount;
        });
        for (var j = 0; j < result.length ; j ++) {
            msg += result[j].msgCount
                + ' (' + Math.floor(10000 * result[j].msgCount / msgAmount)/100
                + '%) - ' + result[j].username + '\n';
        }
    } else {
        msg = 'Sorry, some problem';
    }
    return msg;
}

function compareCount(a, b) {
    return mainContainer[b] - mainContainer[a];
}

function splitString(stringToSplit, separator) {
    return stringToSplit.split(separator)
}

module.exports = statistic;

