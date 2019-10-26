import { Lambda } from 'aws-sdk'

import { invokeLambda } from '..'

describe('invokeLambda', () => {
  test('should call lambda with provided options', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    jest.spyOn((Lambda as any).services['2015-03-31'].prototype, 'invoke')
      .mockImplementation(() => ({ promise: (): string => 'lambda response!!' }))

    const options = { FunctionName: 'screenshot-service-prod-png' }
    expect(await invokeLambda(options)).toEqual('lambda response!!')
  })
})
