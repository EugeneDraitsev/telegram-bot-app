import {
  DynamoDBDocumentClient,
  type GetCommandInput,
  type PutCommandInput,
} from '@aws-sdk/lib-dynamodb'

import {
  DYNAMO_GET_TIMEOUT_MS,
  dynamoDeleteItem,
  dynamoGetItem,
  dynamoPutItem,
  dynamoQuery,
  dynamoQueryAll,
  dynamoScanAll,
  dynamoUpdateItem,
} from '..'

describe('dynamo utils', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('dynamoPutItem should call send on dynamo object and return promise with result', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'put response!!')

    const options = {} as PutCommandInput
    expect(await dynamoPutItem(options)).toEqual('put response!!')
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
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'query response!!')

    const options = {} as PutCommandInput
    expect(await dynamoQuery(options)).toEqual('query response!!')
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
