import { DynamoDB } from 'aws-sdk'

import { dynamoPutItem, dynamoQuery } from '..'

describe('dynamo utils', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn((DynamoDB.DocumentClient as any).prototype, 'put')
    .mockImplementation(() => ({ promise: (): string => 'put response!!' }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jest.spyOn((DynamoDB.DocumentClient as any).prototype, 'query')
    .mockImplementation(() => ({ promise: (): string => 'query response!!' }))


  test('dynamoPutItem should call put on dynamo object and return promise with result', async () => {
    const options = {} as DynamoDB.DocumentClient.PutItemInput
    expect(await dynamoPutItem(options)).toEqual('put response!!')
  })

  test('dynamoQuery should call query on dynamo object and return promise with result', async () => {
    const options = {} as DynamoDB.DocumentClient.PutItemInput
    expect(await dynamoQuery(options)).toEqual('query response!!')
  })
})
