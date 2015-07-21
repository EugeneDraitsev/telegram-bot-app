'use strict';
var PNGImage = require('pngjs-image');

var imageService = {
    getImage: function (callback) {
        var image = PNGImage.createImage(400, 400);

        image.toBlob(function (err, image) {
            callback(image);
        });
    }
};

module.exports = imageService;