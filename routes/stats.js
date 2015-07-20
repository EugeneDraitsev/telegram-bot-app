'use strict';
var express = require('express'),
    fs = require('fs'),
    router = express.Router();

router.get('/', function (req, res) {

    //if (!req.body || !req.body.message || !req.body.message.chat || !req.body.message.message_id || !req.body.message.text) {
    //    res.statusCode = 501; //not implemented
    //    res.end();
    //    return;
    //}
    var stream = fs.createReadStream('../public/favicon.png');

    stream.on('end', function () {
        console.dir(arguments);
    });

    stream.on('data', function () {
        console.dir(arguments);
    });

    stream.pipe(res);

    res.statusCode = 200;
    res.end(stream);
});

module.exports = router;
