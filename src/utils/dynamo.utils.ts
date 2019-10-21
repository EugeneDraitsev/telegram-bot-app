import { DynamoDB } from 'aws-sdk'
import { captureAWSClient } from 'aws-xray-sdk'
import { DocumentClient } from 'aws-sdk/lib/dynamodb/document_client'

const documentClient = new DynamoDB.DocumentClient({
  apiVersion: '2012-08-10',
  region: process.env.region,
  service: new DynamoDB({ apiVersion: '2012-08-10', region: process.env.region }),
})

if (!process.env.IS_LOCAL) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  captureAWSClient((documentClient as any).service)
}

export const dynamoQuery = (params: DynamoDB.DocumentClient.QueryInput): Promise<DocumentClient.QueryOutput> =>
  documentClient.query(params).promise()

export const dynamoPutItem = (params: DynamoDB.DocumentClient.PutItemInput): Promise<DocumentClient.PutItemOutput> =>
  documentClient.put(params).promise()
