/* eslint-disable no-console */
'use strict'
const mongoose = require('mongoose')
mongoose.Promise = Promise
const connectionString = process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost/mongo'
const options = {server: {socketOptions: {keepAlive: 30000, connectTimeoutMS: 30000}}}

function openConnection() {
  return new Promise((resolve, reject) => {
    const connection = mongoose.connect(connectionString, options, err => {
      if (err) {
        console.log('Connection Error:', err.message)
        return reject(err)
      }
      console.log('Connected to DB!')
      return resolve(connection)
    })
  })
}

function closeConnection() {
  return new Promise((resolve, reject) => {
    mongoose.connection.close(function (err) {
      if (err) {
        console.log('Disconnection Error:', err.message)
        return reject(err)
      }
      console.log('Disconnected from DB!')
      return resolve()
    })
  })
}

module.exports = {closeConnection, openConnection}