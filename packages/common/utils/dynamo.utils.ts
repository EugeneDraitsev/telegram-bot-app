import { DynamoDB } from 'aws-sdk'

const documentClient = new DynamoDB.DocumentClient({
  apiVersion: '2012-08-10',
  region: process.env.region,
  service: new DynamoDB({ apiVersion: '2012-08-10', region: process.env.region }),
})

export const dynamoQuery = (params: DynamoDB.DocumentClient.QueryInput) =>
  documentClient.query(params).promise()

export const dynamoPutItem = (params: DynamoDB.DocumentClient.PutItemInput) =>
  documentClient.put(params).promise()
