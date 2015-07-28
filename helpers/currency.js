"use strict";
var request = require('request');

var currency = {
    getCurrency: function (callback) {
        var url = "https://meduza.io/api/v3/stock/all";

        if (validate(new Date())) {
            request.post(url, function(err, response, body) {
                var currency = {};

                if (err) {
                    console.log(err);
                } else {
                    currency.usd = (+(JSON.parse(body).usd.current).toFixed(2));
                    currency.eur = (+(JSON.parse(body).eur.current).toFixed(2));
                    callback(currency);
                }
            });
        }
    };
};

function validate(currentTime) {
    var hoursToCheck = [7, 9, 11, 13, 15, 17];

    if (hoursToCheck.indexOf(currentTime.getHours()) !== -1
        && currentTime.getDay() < 6) {          //check if day isn't a weekend
        return true;
    }
    return false;
}

module.exports = currency;