'use strict';
var _ = require('underscore'),
    request = require('request'),
    imageService = require('../image/png'),
    googleSearchToken = process.env.GOOGLE_SEARCH_TOKEN || 'set_your_token',
    cxToken = process.env.GOOGLE_CX_TOKEN || 'set_your_token';

var google = {
    searchImage: function (query, callback) {
        request
            .get("https://www.googleapis.com/customsearch/v1?searchType=image&imgSize=xlarge&alt=json&num=10&start=1&key=" + googleSearchToken
                + "&cx=" + cxToken + "&q=" + encodeURI(query),
                function (err, httpResponse, body) {
                    var responseData = JSON.parse(body);
                    if (responseData && responseData.items && responseData.items.length > 0) {
                        var image = _.sample(responseData.items),
                            imageUrl = image.link,
                            tbUrl = image.image.thumbnailLink;
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


google.searchImage('cat', function () {
});