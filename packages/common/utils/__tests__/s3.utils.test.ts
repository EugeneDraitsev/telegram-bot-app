import { getFile, saveFile } from '..'

jest.mock('aws-sdk', () => {
  class mockS3 {
    getObject() {
      return { promise: (): string => 'getObject response!!' }
    }
    putObject() {
      return { promise: (): string => 'putObject response!!' }
    }
  }
  return {
    ...jest.requireActual('aws-sdk'),
    S3: mockS3,
  }
})

describe('s3 utils', () => {
  test('dynamoPutItem should call put on dynamo object and return promise with result', async () => {
    expect(await getFile('Bucket', 'Key')).toEqual('getObject response!!')
  })

  test('dynamoQuery should call query on dynamo object and return promise with result', async () => {
    expect(await saveFile('Bucket', 'Key', new Buffer('test'))).toEqual('putObject response!!')
  })
})
