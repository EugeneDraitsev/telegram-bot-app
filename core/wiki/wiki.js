"use strict";
var request = require('request');

var url = "https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&namespace=0&search=";

var wiki = {
    search: function(searchTerm) {
        return new Promise(function (resolve, reject) {
            var target = url + searchTerm;
            request.get(target, function (err, response, body) {
                if (err || !body) {
                    console.log(err);
                    reject(err);
                }

                var response = JSON.parse(body);
                var link = response[3];
                if (link.length === 0) {
                    link = 'Failed to find article for term: ' + response[0];
                }
                resolve(link);
            }).on('error', function (e) {
                console.log('ERR Failed to fetch date from wiki opensearch:' + e);
                reject(e);
            });
        });
    }
};

module.exports = wiki;

