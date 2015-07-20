'use strict';
var express = require('express'),
    imageService = require('../helpers/image.js'),
    router = express.Router();

router.get('/', function (req, res) {
    imageService.getImage(function (image) {
        res.writeHead(200, {'Content-Type': 'image/png'});
        res.end(image);
    });
});

module.exports = router;
