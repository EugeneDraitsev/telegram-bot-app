'use strict';

var moment = require('moment'),
    _ = require('underscore'),
    ChatStatistic = require('../models/chat-statistic'),
    separator = /[\s.,?!]/,
//TODO rework old stat system / rename variables
    mainContainer = {},
    usersContainerDay = {},
    dbStatistic = [],
    startTime = moment().add(3, 'h').format('lll');

ChatStatistic.find(function (err, msg) {
    if (err) {
        console.log('Stat find error: ' + err);
        return;
    }
    dbStatistic = msg;
});

var statistic = {
    //TODO reduce api size
    allTimeStats: allTimeStats,
    updateStatistic: updateStatistic,
    clearUsersDayStatistic: clearUsersDayStatistic,
    getUsersContainerDay: getUsersContainerDay,
    getUsersDayStatistic: getUsersDayStatistic,
    getChatStatistic: getChatStatistic
};

function updateStatistic(msg, user_info, chat_id) {
    //old statistic
    takeMsg(msg);
    takeUserInfo(user_info, chat_id);

    //mongo stat
    var chatStatistic = _.find(dbStatistic, function (chatStat) {
        return chatStat.chat_id === chat_id;
    });

    if (!chatStatistic) {
        chatStatistic = ({chat_id: chat_id, users: []});
        dbStatistic.push(chatStatistic);
    }

    var userStatistic = _.find(chatStatistic.users, function (userStat) {
        return userStat.id === user_info.id;
    });

    if (!userStatistic) {
        userStatistic = {
            id: user_info.id,
            username: user_info.username || user_info.first_name || user_info.last_name || user_info.id,
            msgCount: 1
        };
        chatStatistic.users.push(userStatistic);
    } else {
        userStatistic.msgCount++;
    }
}

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
        result.sort(function (a, b) {
            return b.msgCount - a.msgCount;
        });
        for (var j = 0; j < result.length; j++) {
            msg += result[j].msgCount
                + ' (' + Math.floor(10000 * result[j].msgCount / msgAmount) / 100
                + '%) - ' + result[j].username + '\n';
        }
    } else {
        msg = 'Sorry, some problem';
    }
    return msg;
}

function getUsersContainerDay() {
    return usersContainerDay;
}

function compareCount(a, b) {
    return mainContainer[b] - mainContainer[a];
}

function splitString(stringToSplit, separator) {
    return stringToSplit.split(separator)
}

function getChatStatistic(chat_id) {
    var chatStatistic = _.find(dbStatistic, function (chatStat) {
        return chatStat.chat_id === chat_id;
    });

    if (!chatStatistic) {
        return 'Can\'t find statistic for this chat';
    }

    return chatStatistic;
}
module.exports = statistic;

