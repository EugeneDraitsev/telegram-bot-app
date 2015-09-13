'use strict';
var express = require('express'),
    imageService = require('../core/image/png.js'),
    svgService = require('../core/image/svg.js'),
    Statistics = require('../core/db/models/messages-statistic'),
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

router.get('/db', function (req, res) {
    Statistics.find(function (err, posts) {
        if (err) {
            res.statusCode = 500;
            return res.send({error: 'Server error'});
        }
        res.json(posts);
    });
});

module.exports = router;
