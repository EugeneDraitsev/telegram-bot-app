import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  QueryCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb'
import type { QueryCommandInput, PutCommandInput } from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({ region: process.env.region })
const docClient = DynamoDBDocumentClient.from(client) // client is DynamoDB client

export const dynamoQuery = (params: QueryCommandInput) => {
  const command = new QueryCommand(params)
  return docClient.send(command)
}

export const dynamoPutItem = (params: PutCommandInput) => {
  const command = new PutCommand(params)
  return docClient.send(command)
}
