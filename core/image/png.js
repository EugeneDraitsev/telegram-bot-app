'use strict';
var Q = require('q'),
    request = require('request');

var imageService = {
    getImage: function (url, tbUrl) {
        var deferred = Q.defer();

        tryGetImage(url)
            .then(resolve)
            .catch(function () {
                if (!tbUrl) {
                    reject();
                } else {
                    tryGetImage(tbUrl)
                        .then(resolve)
                        .catch(reject);
                }
            });

        function tryGetImage(url) {
            var deferred = Q.defer();
            try {
                request
                    .get(url)
                    .on('response', function (response) {
                        if (!response.headers || !response.headers['content-type'] || response.headers['content-type'].split('/')[0] !== 'image') {
                            deferred.reject();
                        } else {
                            deferred.resolve(response);
                        }
                    })
                    .on('error', function () {
                        deferred.reject();
                    });
            } catch (e) {
                deferred.reject();
            }
            return deferred.promise;
        }

        function resolve(response) {
            deferred.resolve(response);
        }

        function reject() {
            deferred.reject('can\'t load image\n' + url);
        }

        return deferred.promise;
    }
};

module.exports = imageService;