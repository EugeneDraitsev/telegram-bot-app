"use strict";
var request = require('request'),
    moment = require('moment-timezone'),
    image = require('../image/png'),
    Q = require('q'),
    _ = require('lodash');

var HOURS_TO_CHECK = _.range(10, 21);

var currency = {
    getCurrency: function () {
        var url = "https://meduza.io/api/v3/stock/all",
            deferred = Q.defer();
        request.post(url, function (err, response, body) {
            var currency = {};

            if (err || !body) {
                console.log(err);
                return deferred.resolve(err);
            }

            _.mapKeys(JSON.parse(body), function (val, key) {
                if (val.current) {
                    currency[key] = val['current'].toFixed(2);
                }
            });
            deferred.resolve(currency);
        }).on('error', function (e) {
            console.log('ERROR getting currency from meduza:' + e);
            deferred.resolve('ERROR getting currency from meduza:');
        });
        return deferred.promise;
    },

    getScheduledCurrency: function () {
        if (validate(moment().tz('Europe/Minsk'))) {
            return currency.getCurrency();
        }
    }
};

function validate(time) {
    return _.contains(HOURS_TO_CHECK, Number(time.format("H"))) && time.isoWeekday() < 6;
}

module.exports = currency;