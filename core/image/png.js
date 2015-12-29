'use strict';
var PNGImage = require('pngjs-image'),
    request = require('request');

var imageService = {
    getImage: function (url, callback, tbUrl) {
        try {
            request
                .get(url)
                .on('response', function (response) {
                    if (!response.headers || !response.headers['content-type']) {
                        callback('can\'t load image');
                        return;
                    }
                    if (response.headers['content-type'].split('/')[0] !== 'image') {
                        if (!tbUrl) {
                            callback('can\'t load even preview');
                            return;
                        }
                        imageService.getImage(tbUrl, callback);
                        return;
                    }
                    callback(false, response, url);
                }).on('error', function (e) {
                console.log('ERROR uploading pic from server:' + e);
                imageService.getImage(tbUrl, callback);
            });
        } catch (e) {
            if (!tbUrl) {
                callback('can\'t load image')
            }
            imageService.getImage(tbUrl, callback);
        }
    },

    getTestImage: function (callback) {
        var image = PNGImage.createImage(400, 400);
        for (var i = 0; i < 400; i++) {
            for (var j = 0; j < 400; j++) {
                image.setAt(i, j, {
                    red: 255 * Math.random(),
                    green: 255 * Math.random(),
                    blue: 255 * Math.random(),
                    alpha: 255
                });
            }
        }

        image.toBlob(function (err, image) {
            callback(image);
        });
    }
};

module.exports = imageService;