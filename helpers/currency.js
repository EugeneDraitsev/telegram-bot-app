"use strict";
var request = require('request'),
    _ = require('underscore');
    
var HOURS_TO_CHECK = [7, 9, 11, 13, 15, 17];

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
        if (validate(new Date())) {
            currency.getCurrency(callback);
        }
    }
};

function validate(currentTime) {
    return _.contains(HOURS_TO_CHECK, currentTime.getHours() && currentTime.getDay() < 6);
}

module.exports = currency;