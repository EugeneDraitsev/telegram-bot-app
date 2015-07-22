'use strict';
var PNGImage = require('pngjs-image');

var imageService = {
    getImage: function (callback) {
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