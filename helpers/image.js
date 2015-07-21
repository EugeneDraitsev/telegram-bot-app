'use strict';
var PNGImage = require('pngjs-image');

var imageService = {
    getImage: function (callback) {
        var image = PNGImage.createImage(400, 400), stream;

        image.toBlob(function (err, image) {
            stream = image;
            callback(stream);
        });
    }
};

module.exports = imageService;