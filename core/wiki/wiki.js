"use strict";
var request = require('request'),
    Q = require('q'),
    _ = require('lodash');

var wiki = {
    search: function(searchTerm) {
        var url = "https://en.wikipedia.org/w/api.php?action=opensearch&format=json&limit=1&namespace=0&search=" +
                searchTerm;
        var deferred = Q.defer();

        request.get(url, function (err, response, body) {
            if (err || !body) {
                console.log(err);
                return deferred.resolve(err);
            }

            var response = JSON.parse(body);
            var link = response[3].length === 0 ?
                    'Failed to find article for term: ' + response[0] :
                    response[3];
            deferred.resolve(link);
        }).on('error', function (e) {
            console.log('ERR Failed to fetch date from wiki opensearch:' + e);
            deferred.resolve('ERR Failed to fetch date from wiki opensearch');
        });

        return deferred.promise();
    }
}

