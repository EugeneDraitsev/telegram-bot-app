/* tslint:disable:no-console */
import * as mongoose from 'mongoose'

const connectionString = process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost/mongo'
const options = { keepAlive: 30000, connectTimeoutMS: 30000 }

export function openConnection() {
  return new Promise((resolve, reject) => {
    const connection: any = mongoose.connect(connectionString, options, (err) => {
      if (err) {
        console.log('Connection Error:', err.message)
        return reject(err)
      }
      console.log('Connected to DB!')
      return resolve(connection)
    })
  })
}

export function closeConnection() {
  return new Promise((resolve, reject) => {
    mongoose.connection.close((err) => {
      if (err) {
        console.log('Disconnection Error:', err.message)
        return reject(err)
      }
      console.log('Disconnected from DB!')
      return resolve()
    })
  })
}
