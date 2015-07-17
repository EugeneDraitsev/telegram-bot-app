'use strict';
var http = require('http'),
    querystring = require('querystring'),
    request = require('request');

var google = {
    search: function (query, callback) {
        // Execute the request
        var googleRequest = http.request("http://ajax.googleapis.com/ajax/services/search/images?v=1.0&as_filetype=jpg%20png&rsz=8&q=" + encodeURI(query), function (googleResponse) {
            googleResponse.setEncoding('utf8');

            // Read the response
            var output = '';
            googleResponse.on('data', function (chunk) {
                output += chunk;
            });

            // Return the received data when finished, using the specified callback function
            googleResponse.on('end', function () {
                var responseData = JSON.parse(output).responseData;
                if (responseData.results.length > 0) {
                    var index = Math.floor(Math.random() * responseData.results.length),
                        imageUrl = responseData.results[index].unescapedUrl,
                        tbUrl = responseData.results[index].tbUrl;
                    google.getImage(imageUrl, callback, tbUrl);
                }
                else {
                    callback('Google can\'t find it for you');
                }
            });
        });

        // Log errors and return an error message instead of weather message
        googleRequest.on('error', function () {
            callback('Sorry, could not get the data from Google.');
        });

        googleRequest.end();
    },

    getImage: function (url, callback, tbUrl) {
        request
            .get(url)
            .on('response', function (response) {
                if (response.headers['content-type'].split('/')[0] !== 'image') {
                    if (!tbUrl) {
                        callback('can\'t load even preview');
                        return;
                    }
                    google.getImage(tbUrl, callback);
                    return;
                }
                callback(response, true, url);
            });
    }
};
module.exports = google;
