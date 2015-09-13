var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var statisticSchema = new Schema({
    mainContainer: {type: String, required: true},
    id: {type: String, required: true}
});


var statisticModel = mongoose.model('post', statisticSchema);
module.exports = statisticModel;