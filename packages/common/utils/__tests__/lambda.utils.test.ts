import { Lambda } from 'aws-sdk'

import { invokeLambda } from '../index'

describe('invokeLambda', () => {
  test('should call lambda with provided options', async () => {
    jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn((Lambda as any).services['2015-03-31'].prototype, 'invoke')
      .mockImplementation(() => ({ promise: (): string => 'lambda response!!' }))

    const options = { FunctionName: `screenshot-service-${process.env.stage}-png` }
    expect(await invokeLambda(options)).toEqual('lambda response!!')
  })
})
