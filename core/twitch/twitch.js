'use strict';
var request = require("request"),
    Q = require('q'),
    _ = require('lodash'),
    PAPICH_TITLES = [
        "НЫАААААААА",
        "Папаня подрубил",
        "ЛЕГКОСТЬ СОЛЯРЫ",
        "VI KA",
        "ТУК ТУК ТУК",
        "запускаем бинго"
    ];

var twitch = {
    checkPapanya: function () {
        var papichURL = 'https://api.twitch.tv/kraken/streams?game=Dota+2&channel=evilarthas',
            deferred = Q.defer();

        request(papichURL, function (err, resp, body) {
            if (err || !body) {
                console.log("Error trying to get PAPANYA");
                return deferred.reject();
            }
            deferred.resolve(resp.body);
        });

        return deferred.promise;
    },
    randomPapichTitle: function () {
        return _.sample(PAPICH_TITLES);
    }
};

module.exports = twitch;