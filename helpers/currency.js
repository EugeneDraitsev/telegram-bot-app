"use strict";
var request = require('request'),
    moment = require('moment-timezone'),
    _ = require('underscore');

var HOURS_TO_CHECK = [10, 12, 14, 16, 18, 20];

var currency = {
    getCurrency: function (callback) {
        var url = "https://meduza.io/api/v3/stock/all";
        request.post(url, function (err, response, body) {
            var currency = {};

            if (err || !body) {
                console.log(err);
                return false;
            }

            _.mapObject(JSON.parse(body), function (val, key) {
                if (_.has(val, 'current')) {
                    currency[key] = val['current'].toFixed(2);
                }
            });
            callback(currency);
        }).on('error', function (e) {
            console.log('ERROR getting currency from meduza:' + e);
        });
    },
    getScheduledCurrency: function (callback) {
        if (validate(moment().tz('Europe/Minsk'))) {
            currency.getCurrency(callback);
        }
    }
};

function validate(time) {
    return _.contains(HOURS_TO_CHECK, Number(time.format("H"))) && time.format("d") < 6;
}

module.exports = currency;