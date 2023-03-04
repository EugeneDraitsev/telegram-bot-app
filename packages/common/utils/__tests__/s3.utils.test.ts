import { S3Client } from '@aws-sdk/client-s3'

import { getFile, saveFile } from '..'

describe('s3 utils', () => {
  test('getFile should call send on s3 object and handle files with data and empty files', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(() => ({
      Body: {
        transformToString: () => 'getObject response!!',
      },
    }))

    expect(await getFile('Bucket', 'Key')).toEqual('getObject response!!')

    jest.spyOn(S3Client.prototype, 'send').mockImplementation(() => ({
      Body: undefined,
    }))

    expect(await getFile('Bucket', 'Key')).toEqual(undefined)
  })

  test('saveFile should call send on s3 object and return promise with result', async () => {
    jest
      .spyOn(S3Client.prototype, 'send')
      .mockImplementation(() => 'putObject response!!')

    expect(await saveFile('Bucket', 'Key', new Buffer('test'))).toEqual(
      'putObject response!!',
    )
  })
})
