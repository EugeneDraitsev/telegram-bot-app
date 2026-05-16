import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type {
  DeleteCommandInput,
  DeleteCommandOutput,
  PutCommandInput,
  PutCommandOutput,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommandInput,
  UpdateCommandInput,
  UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({ region: process.env.region })
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

export const dynamoQuery = (
  params: QueryCommandInput,
): Promise<QueryCommandOutput> => {
  const command = new QueryCommand(params)
  return docClient.send(command)
}

export const dynamoPutItem = (
  params: PutCommandInput,
): Promise<PutCommandOutput> => {
  const command = new PutCommand(params)
  return docClient.send(command)
}

export const dynamoDeleteItem = (
  params: DeleteCommandInput,
): Promise<DeleteCommandOutput> => {
  const command = new DeleteCommand(params)
  return docClient.send(command)
}

export const dynamoUpdateItem = (
  params: UpdateCommandInput,
): Promise<UpdateCommandOutput> => {
  const command = new UpdateCommand(params)
  return docClient.send(command)
}

export const dynamoScan = async <T = Record<string, unknown>>(
  inputParams: ScanCommandInput,
): Promise<T[]> => {
  const results: T[] = []
  const params = { ...inputParams }

  while (true) {
    const scanResults = await docClient.send(new ScanCommand(params))
    results.push(...((scanResults.Items as T[]) || []))

    if (typeof scanResults.LastEvaluatedKey === 'undefined') {
      return results
    }

    params.ExclusiveStartKey = scanResults.LastEvaluatedKey
  }
}
