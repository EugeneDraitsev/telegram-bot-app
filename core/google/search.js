'use strict';
var _ = require('lodash'),
    request = require('request'),
    Q = require('q'),
    imageService = require('../image/png'),
    googleSearchToken = process.env.GOOGLE_SEARCH_TOKEN || 'set_your_token',
    cxToken = process.env.GOOGLE_CX_TOKEN || 'set_your_token';

var google = {
    searchImage: function (query) {
        var deferred = Q.defer();
        request
            .get("https://www.googleapis.com/customsearch/v1?searchType=image&imgSize=xlarge&alt=json&num=10&start=1&key=" + googleSearchToken
                + "&cx=" + cxToken + "&q=" + encodeURI(query),
                function (err, httpResponse, body) {
                    try {
                        var responseData = JSON.parse(body);
                        if (responseData && responseData.items && responseData.items.length > 0) {
                            var image = _.sample(responseData.items),
                                imageUrl = image.link,
                                tbUrl = image.image.thumbnailLink;
                            imageService.getImage(imageUrl, tbUrl)
                                .then(function (response) {
                                    deferred.resolve({image: response, url: imageUrl});
                                })
                                .catch(function (error) {
                                    deferred.reject(error);
                                });
                        }
                        else {
                            console.dir(responseData);
                            deferred.reject('Google can\'t find it for you');
                        }
                    } catch (e) {
                        deferred.reject('Something going wrong');
                    }
                })
            .on('error', function () {
                deferred.reject('ERROR getting search result from google');
            });

        return deferred.promise
    }
};
module.exports = google;