import { LambdaClient } from '@aws-sdk/client-lambda'

import { invokeLambda } from '..'

describe('invokeLambda', () => {
  test('should call lambda with provided options', async () => {
    jest.spyOn(LambdaClient.prototype, 'send').mockImplementation(() => 'lambda response!!')

    const options = { FunctionName: `screenshot-service-${process.env.stage}-png` }
    expect(await invokeLambda('name', options)).toEqual('lambda response!!')
  })
})
