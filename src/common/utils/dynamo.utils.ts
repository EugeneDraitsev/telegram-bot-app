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

interface DynamoScanOptions {
  maxItems?: number
  maxPages?: number
}

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
  options: DynamoScanOptions = {},
): Promise<T[]> => {
  const results: T[] = []
  let exclusiveStartKey = inputParams.ExclusiveStartKey
  let pages = 0

  while (true) {
    if (options.maxPages !== undefined && pages >= options.maxPages) {
      return results
    }

    const scanResults = await docClient.send(
      new ScanCommand({
        ...inputParams,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    )
    pages += 1

    const items = (scanResults.Items as T[]) || []
    const remainingItems =
      options.maxItems === undefined
        ? items
        : items.slice(0, Math.max(options.maxItems - results.length, 0))

    results.push(...remainingItems)

    if (options.maxItems !== undefined && results.length >= options.maxItems) {
      return results
    }

    if (typeof scanResults.LastEvaluatedKey === 'undefined') {
      return results
    }

    exclusiveStartKey = scanResults.LastEvaluatedKey
  }
}
