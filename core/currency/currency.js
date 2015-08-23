"use strict";
var request = require('request'),
    moment = require('moment-timezone'),
    image = require('../image/png'),
    _ = require('underscore');

var HOURS_TO_CHECK = _.range(10, 21);

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
    },

    getCurrencyGraph: function (callback, type) {
        var url = 'http://j1.forexpf.ru/delta/prochart?type=USDRUB&amount=500&chart_height=600&chart_width=1200&grtype=2&tictype=' + type;
        image.getImage(url, function (error, image) {
            callback(error, image, url);
        });
    }
};

function validate(time) {
    return _.contains(HOURS_TO_CHECK, Number(time.format("H"))) && time.isoWeekday() < 6;
}

module.exports = currency;