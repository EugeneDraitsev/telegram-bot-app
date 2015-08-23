'use strict';
var express = require('express'),
    imageService = require('../helpers/image/png.js'),
    svgService = require('../helpers/image/svg.js'),
    router = express.Router();

router.get('/', function (req, res) {
    imageService.getTestImage(function (image) {
        res.writeHead(200, {'Content-Type': 'image/png'});
        res.end(image);
    });
});

router.get('/svg', function (req, res) {
    var svg = svgService.getSampleSVG();
    res.writeHead(200, {'Content-Type': 'image/svg+xml'})
    res.end(svg);
});

module.exports = router;
