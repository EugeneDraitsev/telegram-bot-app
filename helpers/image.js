'use strict';
var PNGImage = require('pngjs-image');

var imageService = {
    getImage: function (callback) {
        var image = PNGImage.createImage(400, 400);
        for (var i = 0; i < 400; i++) {
            for (var j = 0; j < 400; j++) {
                //image.setAt(i, j, {red: j * i % 255, green: 144 - j * i % 255, blue: 110 - j * i % 255, alpha: 100});
                image.setAt(i, j, {
                    red: Math.random() * 255,
                    green: Math.random() * 255,
                    blue: Math.random() * 255,
                    alpha: 100
                });
            }
        }

        image.toBlob(function (err, image) {
            callback(image);
        });
    }
};

module.exports = imageService;