import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type {
  DeleteCommandInput,
  DeleteCommandOutput,
  PutCommandInput,
  PutCommandOutput,
  QueryCommandInput,
  QueryCommandOutput,
  TransactWriteCommandInput,
  TransactWriteCommandOutput,
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

export const dynamoQueryAll = async <T = Record<string, unknown>>(
  inputParams: QueryCommandInput,
): Promise<T[]> => {
  const results: T[] = []
  let exclusiveStartKey = inputParams.ExclusiveStartKey

  while (true) {
    const queryResults = await docClient.send(
      new QueryCommand({
        ...inputParams,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    )
    results.push(...((queryResults.Items as T[]) ?? []))

    if (!queryResults.LastEvaluatedKey) {
      return results
    }

    exclusiveStartKey = queryResults.LastEvaluatedKey
  }
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

export const dynamoTransactWrite = (
  params: TransactWriteCommandInput,
): Promise<TransactWriteCommandOutput> => {
  const command = new TransactWriteCommand(params)
  return docClient.send(command)
}

/**
 * True only when a transaction was cancelled because one of its conditions
 * failed. Cancellations from throttling or capacity must stay fatal so the
 * message is retried instead of being mistaken for a duplicate.
 */
export const isTransactionConditionFailure = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }

  const candidate = error as {
    name?: unknown
    CancellationReasons?: Array<{ Code?: unknown }>
  }
  if (candidate.name !== 'TransactionCanceledException') {
    return false
  }

  return (candidate.CancellationReasons ?? []).some(
    (reason) => reason?.Code === 'ConditionalCheckFailed',
  )
}
