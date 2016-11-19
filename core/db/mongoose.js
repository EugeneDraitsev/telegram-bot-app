'use strict';
const mongoose = require('mongoose')
const connectionString = process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost/mongo'
const options = {server: {socketOptions: {keepAlive: 30000, connectTimeoutMS: 30000}}}


function openConnection() {
    return new Promise((resolve, reject) => {
        const connection = mongoose.createConnection(connectionString, options, err => {
            if (err) {
                console.log('Connection Error:', err.message)
                return reject(err)
            }
            console.log("Connected to DB!")
            resolve(connection)
        })
    })
}


function closeConnection(connection, callback) {
    console.log("Close connection")
    connection.close(function () {
        callback()
    })
}


module.exports = {closeConnection, openConnection}