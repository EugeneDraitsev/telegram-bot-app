'use strict';
var request = require("request"),
    PAPICH_TITLES = [
        "НЫАААААААА",
        "Папаня подрубил",
        "ЛЕГКОСТЬ СОЛЯРЫ",
        "VI KA",
        "ТУК ТУК ТУК",
        "запускаем бинго"
    ];

var twitch = {
    checkPapanya: function (callback) {
        var papichURL = 'https://api.twitch.tv/kraken/streams?game=Dota+2&channel=evilarthas';
        request(papichURL, function (err, resp, body) {
            if (err || !body) {
                console.log("Error trying to get PAPANYA");
                return false;
            }
            callback(resp.body);
        });
    },
    randomPapichTitle: function () {
        return PAPICH_TITLES[Math.floor(Math.random() * PAPICH_TITLES.length)];
    }
};

module.exports = twitch;