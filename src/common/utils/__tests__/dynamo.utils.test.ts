import {
  DynamoDBDocumentClient,
  type GetCommandInput,
  type PutCommandInput,
} from '@aws-sdk/lib-dynamodb'

import {
  DYNAMO_GET_TIMEOUT_MS,
  DYNAMO_OP_TIMEOUT_MS,
  dynamoBatchGetAll,
  dynamoCountAll,
  dynamoDeleteItem,
  dynamoGetItem,
  dynamoPutItem,
  dynamoQuery,
  dynamoQueryAll,
  dynamoScanAll,
  dynamoTransactWrite,
  dynamoUpdateItem,
} from '..'

describe('dynamo utils', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('dynamoPutItem should call send on dynamo object and return promise with result', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'put response!!')

    const options = {} as PutCommandInput
    expect(await dynamoPutItem(options)).toEqual('put response!!')
    expect(sendSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    )
  })

  test('dynamoGetItem should call send on dynamo object and return promise with result', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'get response!!')

    const options = {} as GetCommandInput
    expect(await dynamoGetItem(options)).toEqual('get response!!')
    expect(sendSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    )
    expect(DYNAMO_GET_TIMEOUT_MS).toBeLessThan(10_000)
  })

  test('dynamoQuery should call send on dynamo object and return promise with result', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'query response!!')

    const options = {} as PutCommandInput
    expect(await dynamoQuery(options)).toEqual('query response!!')
    expect(sendSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
    )
    expect(DYNAMO_OP_TIMEOUT_MS).toBeLessThan(10_000)
  })

  test('dynamo writes bound every operation well under the webhook limit', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'ok')

    await dynamoUpdateItem({
      TableName: 'table',
      Key: {},
      UpdateExpression: 'SET #value = :value',
    })
    await dynamoDeleteItem({ TableName: 'table', Key: {} })
    await dynamoTransactWrite({ TransactItems: [] })
    expect(sendSpy).toHaveBeenCalledTimes(3)
    for (const call of sendSpy.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      )
    }
    expect(DYNAMO_OP_TIMEOUT_MS).toBeLessThan(10_000)
  })

  test('dynamoBatchGetAll chunks requests at the DynamoDB limit', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockResolvedValueOnce({ Responses: { table: [{ id: 1 }] } } as never)
      .mockResolvedValueOnce({ Responses: { table: [{ id: 101 }] } } as never)
    const keys = Array.from({ length: 101 }, (_, index) => ({ id: index + 1 }))

    await expect(dynamoBatchGetAll('table', keys)).resolves.toEqual([
      { id: 1 },
      { id: 101 },
    ])
    expect(
      (
        sendSpy.mock.calls[0][0].input as {
          RequestItems: { table: { Keys: unknown[] } }
        }
      ).RequestItems.table.Keys,
    ).toHaveLength(100)
    expect(
      (
        sendSpy.mock.calls[1][0].input as {
          RequestItems: { table: { Keys: unknown[] } }
        }
      ).RequestItems.table.Keys,
    ).toEqual([{ id: 101 }])
  })

  test('dynamoBatchGetAll retries unprocessed keys', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockResolvedValueOnce({
        Responses: { table: [{ id: 1 }] },
        UnprocessedKeys: { table: { Keys: [{ id: 2 }] } },
      } as never)
      .mockResolvedValueOnce({ Responses: { table: [{ id: 2 }] } } as never)

    await expect(
      dynamoBatchGetAll('table', [{ id: 1 }, { id: 2 }]),
    ).resolves.toEqual([{ id: 1 }, { id: 2 }])
    expect(
      (
        sendSpy.mock.calls[1][0].input as {
          RequestItems: { table: { Keys: unknown[] } }
        }
      ).RequestItems.table.Keys,
    ).toEqual([{ id: 2 }])
  })

  test('dynamoQueryAll should collect all paginated query results', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() =>
        Promise.resolve({
          Items: [{ id: 1 }],
          LastEvaluatedKey: { id: 1 },
        }),
      )
      .mockImplementationOnce(() => Promise.resolve({ Items: [{ id: 2 }] }))

    expect(await dynamoQueryAll({ TableName: 'table' })).toEqual([
      { id: 1 },
      { id: 2 },
    ])
    expect(
      (sendSpy.mock.calls[1][0].input as { ExclusiveStartKey?: unknown })
        .ExclusiveStartKey,
    ).toEqual({ id: 1 })
  })

  test('dynamoCountAll sums Count across pages and never asks for items', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() =>
        Promise.resolve({ Count: 900, LastEvaluatedKey: { date: 42 } }),
      )
      .mockImplementationOnce(() => Promise.resolve({ Count: 77 }))

    expect(await dynamoCountAll({ TableName: 'table' })).toBe(977)
    expect(sendSpy).toHaveBeenCalledTimes(2)

    const first = sendSpy.mock.calls[0][0].input as {
      Select?: string
      ExclusiveStartKey?: unknown
    }
    const second = sendSpy.mock.calls[1][0].input as {
      Select?: string
      ExclusiveStartKey?: unknown
    }
    expect(first.Select).toBe('COUNT')
    expect(first.ExclusiveStartKey).toBeUndefined()
    expect(second.Select).toBe('COUNT')
    expect(second.ExclusiveStartKey).toEqual({ date: 42 })
  })

  test('dynamoCountAll treats a page without Count as zero', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() => Promise.resolve({}))

    expect(await dynamoCountAll({ TableName: 'table' })).toBe(0)
  })

  test('dynamoScanAll should collect all paginated scan results', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() =>
        Promise.resolve({
          Items: [{ id: 1 }],
          LastEvaluatedKey: { id: 1 },
        }),
      )
      .mockImplementationOnce(() => Promise.resolve({ Items: [{ id: 2 }] }))

    expect(await dynamoScanAll({ TableName: 'table' })).toEqual([
      { id: 1 },
      { id: 2 },
    ])
    expect(
      (sendSpy.mock.calls[1][0].input as { ExclusiveStartKey?: unknown })
        .ExclusiveStartKey,
    ).toEqual({ id: 1 })
  })

  test('dynamoDeleteItem should call send on dynamo object and return promise with result', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'delete response!!')

    expect(await dynamoDeleteItem({ TableName: 'table', Key: {} })).toEqual(
      'delete response!!',
    )
  })

  test('dynamoUpdateItem should call send on dynamo object and return promise with result', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'update response!!')

    expect(
      await dynamoUpdateItem({
        TableName: 'table',
        Key: {},
        UpdateExpression: 'SET #value = :value',
      }),
    ).toEqual('update response!!')
  })
})
