var mongoose = require('mongoose'),
    connectionURL = process.env.IP ? 'mongodb://' + process.env.IP + ':27017/statistic' : 'mongodb://localhost/mongo';

mongoose.connect(connectionURL);
var db = mongoose.connection;

db.on('error', function (err) {
    console.log('connection error:', err.message);
});
db.once('open', function callback() {
    console.log("Connected to DB!");
});
