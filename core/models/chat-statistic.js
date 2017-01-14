'use strict'
const mongoose = require('mongoose')
const Schema = mongoose.Schema

const chatStatistic = new Schema({
  chat_id: {type: Number, required: true},
  users: [{
    id: {type: Number, required: true},
    username: {type: String, required: true},
    msgCount: {type: Number, required: true}
  }]
})

module.exports = mongoose.model('chatStatistic', chatStatistic)