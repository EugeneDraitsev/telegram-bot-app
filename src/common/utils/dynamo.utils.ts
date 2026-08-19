import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  BatchGetCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import type {
  DeleteCommandInput,
  DeleteCommandOutput,
  GetCommandInput,
  GetCommandOutput,
  PutCommandInput,
  PutCommandOutput,
  QueryCommandInput,
  QueryCommandOutput,
  ScanCommandInput,
  TransactWriteCommandInput,
  TransactWriteCommandOutput,
  UpdateCommandInput,
  UpdateCommandOutput,
} from '@aws-sdk/lib-dynamodb'

const client = new DynamoDBClient({ region: process.env.region })

// Bun loads local credentials during tests. Keep an accidentally unmocked
// DynamoDB call from ever reaching AWS; mocked DocumentClient.send calls still
// bypass this client middleware normally.
if (process.env.NODE_ENV === 'test') {
  client.middlewareStack.add(
    () => async () => {
      throw new Error('DynamoDB network access is disabled during tests')
    },
    {
      name: 'blockDynamoNetworkDuringTests',
      step: 'initialize',
      priority: 'high',
    },
  )
}

const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

export const DYNAMO_GET_TIMEOUT_MS = 1_000
const DYNAMO_BATCH_GET_MAX_KEYS = 100
const DYNAMO_BATCH_GET_MAX_ATTEMPTS = 5
const DYNAMO_BATCH_GET_RETRY_DELAY_MS = 25

type DynamoDocumentKey = Record<string, string | number>

export const dynamoQuery = (
  params: QueryCommandInput,
): Promise<QueryCommandOutput> => {
  const command = new QueryCommand(params)
  return docClient.send(command)
}

export const dynamoGetItem = (
  params: GetCommandInput,
): Promise<GetCommandOutput> => {
  const command = new GetCommand(params)
  return docClient.send(command, {
    abortSignal: AbortSignal.timeout(DYNAMO_GET_TIMEOUT_MS),
  })
}

export const dynamoBatchGetAll = async <T = Record<string, unknown>>(
  tableName: string,
  keys: DynamoDocumentKey[],
): Promise<T[]> => {
  const results: T[] = []

  for (
    let offset = 0;
    offset < keys.length;
    offset += DYNAMO_BATCH_GET_MAX_KEYS
  ) {
    let pendingKeys = keys.slice(offset, offset + DYNAMO_BATCH_GET_MAX_KEYS)

    for (
      let attempt = 0;
      attempt < DYNAMO_BATCH_GET_MAX_ATTEMPTS;
      attempt += 1
    ) {
      const response = await docClient.send(
        new BatchGetCommand({
          RequestItems: { [tableName]: { Keys: pendingKeys } },
        }),
      )
      results.push(...((response.Responses?.[tableName] as T[]) ?? []))
      pendingKeys =
        (response.UnprocessedKeys?.[tableName]?.Keys as
          | DynamoDocumentKey[]
          | undefined) ?? []

      if (pendingKeys.length === 0) break
      if (attempt === DYNAMO_BATCH_GET_MAX_ATTEMPTS - 1) {
        throw new Error(`Could not read all DynamoDB items from ${tableName}`)
      }
      await new Promise((resolve) =>
        setTimeout(resolve, DYNAMO_BATCH_GET_RETRY_DELAY_MS * 2 ** attempt),
      )
    }
  }

  return results
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

export const dynamoScanAll = async <T = Record<string, unknown>>(
  inputParams: ScanCommandInput,
): Promise<T[]> => {
  const results: T[] = []
  let exclusiveStartKey = inputParams.ExclusiveStartKey

  while (true) {
    const scanResults = await docClient.send(
      new ScanCommand({
        ...inputParams,
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    )
    results.push(...((scanResults.Items as T[]) ?? []))

    if (!scanResults.LastEvaluatedKey) {
      return results
    }

    exclusiveStartKey = scanResults.LastEvaluatedKey
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
