var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var chatStatistic = new Schema({
    chat_id: {type: Number, required: true},
    users: [{
        id : {type: Number, required: true},
        username: {type: String, required: true},
        msgCount: {type: Number, required: true}
    }]
});


var chatStatistic = mongoose.model('chatStatistic', chatStatistic);
module.exports = chatStatistic;