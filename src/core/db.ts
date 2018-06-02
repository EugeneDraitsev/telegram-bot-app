import * as mongoose from 'mongoose'

const connectionString = process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost/mongo'
const options = { keepAlive: 30000, connectTimeoutMS: 30000 }

export function openConnection() {
  return new Promise((resolve, reject) => {
    const connection: any = mongoose.connect(connectionString, options, (err) => {
      if (err) {
        return reject(err)
      }
      return resolve(connection)
    })
  })
}

export const closeConnection = () => mongoose.connection.close()
