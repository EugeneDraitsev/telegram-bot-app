'use strict';
var PNGImage = require('pngjs-image');

var imageService = {
    getImage: function (callback) {
        var image = PNGImage.createImage(400, 400);
        for (var i = 0; i < 400; i++) {
            for (var j = 0; j < 400; j++) {
                //image.setAt(i, j, {
                //    red: j * i % 255,
                //    green: 144 - j * i % 255,
                //    blue: 110 - j * i % 255,
                //    alpha: j * i % 255
                //});
                image.setAt(i, j, {
                    red: 255,
                    green: 255,
                    blue: 255,
                    alpha: 255
                });
            }
        }
        var black = {
            red: 0,
            green: 0,
            blue: 0,
            alpha: 255
        }
        imageService.drawCircle(image, 25, 0, 0, black);
        image.toBlob(function (err, image) {
            callback(image);
        });
    },
    drawCircle: function (image, radius, x, y, color) {
        for (var i = 0; i < radius; i++) {
            image.setAt(i, Math.cos(i / radius) * 2 * radius, color);
        }
    }
};

module.exports = imageService;