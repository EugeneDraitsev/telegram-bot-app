'use strict';
var _ = require('underscore'),
    request = require('request'),
    imageService = require('../image/png');

var google = {
    searchImage: function (query, callback) {
        request
            .get("http://ajax.googleapis.com/ajax/services/search/images?v=1.0&as_filetype=jpg%20png&rsz=8&q=" + encodeURI(query),
            function (err, httpResponse, body) {
                var responseData = JSON.parse(body).responseData;
                if (responseData.results && responseData.results.length > 0) {
                    var image = _.sample(responseData.results),
                        imageUrl = image.unescapedUrl,
                        tbUrl = image.tbUrl;
                    imageService.getImage(imageUrl, callback, tbUrl);
                }
                else {
                    callback('Google can\'t find it for you');
                }
            }).on('error', function (e) {
                console.log('ERROR getting search result from google:' + e);
            });
    }
};
module.exports = google;