import {
  DynamoDBDocumentClient,
  type PutCommandInput,
} from '@aws-sdk/lib-dynamodb'

import {
  dynamoDeleteItem,
  dynamoPutItem,
  dynamoQuery,
  dynamoScan,
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

  test('dynamoQuery should call send on dynamo object and return promise with result', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementation(() => 'query response!!')

    const options = {} as PutCommandInput
    expect(await dynamoQuery(options)).toEqual('query response!!')
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

  test('dynamoScan should collect all paginated scan results', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() =>
        Promise.resolve({
          Items: [{ id: 1 }],
          LastEvaluatedKey: { id: 1 },
        }),
      )
      .mockImplementationOnce(() => Promise.resolve({ Items: [{ id: 2 }] }))

    expect(await dynamoScan({ TableName: 'table' })).toEqual([
      { id: 1 },
      { id: 2 },
    ])
  })

  test('dynamoScan should stop at maxPages', async () => {
    const sendSpy = jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() =>
        Promise.resolve({
          Items: [{ id: 1 }],
          LastEvaluatedKey: { id: 1 },
        }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({
          Items: [{ id: 2 }],
          LastEvaluatedKey: { id: 2 },
        }),
      )

    expect(await dynamoScan({ TableName: 'table' }, { maxPages: 1 })).toEqual([
      { id: 1 },
    ])
    expect(sendSpy).toHaveBeenCalledTimes(1)
  })

  test('dynamoScan should stop at maxItems', async () => {
    jest
      .spyOn(DynamoDBDocumentClient.prototype, 'send')
      .mockImplementationOnce(() =>
        Promise.resolve({
          Items: [{ id: 1 }, { id: 2 }],
          LastEvaluatedKey: { id: 2 },
        }),
      )

    expect(await dynamoScan({ TableName: 'table' }, { maxItems: 1 })).toEqual([
      { id: 1 },
    ])
  })
})
