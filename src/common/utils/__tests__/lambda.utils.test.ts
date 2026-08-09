import { type InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { invokeLambda } from '..'

type LambdaSend = LambdaClient['send']

const mockLambdaSend = (
  implementation: (this: LambdaClient, command: InvokeCommand) => unknown,
) =>
  jest
    .spyOn(LambdaClient.prototype, 'send')
    .mockImplementation(implementation as unknown as LambdaSend)

describe('invokeLambda', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('should call lambda with provided options', async () => {
    mockLambdaSend(() => 'lambda response!!')

    expect(
      await invokeLambda({
        name: 'my-function',
        payload: { key: 'value' },
      }),
    ).toEqual('lambda response!!')
  })

  test('should set InvocationType to Event when async is true', async () => {
    let capturedCommand: InvokeCommand | undefined

    mockLambdaSend((command) => {
      capturedCommand = command
      return Promise.resolve('ok')
    })

    await invokeLambda({
      name: 'my-function',
      payload: { data: 'test' },
      async: true,
    })

    expect(capturedCommand?.input.InvocationType).toBe('Event')
  })

  test('should not set InvocationType when async is false', async () => {
    let capturedCommand: InvokeCommand | undefined

    mockLambdaSend((command) => {
      capturedCommand = command
      return Promise.resolve('ok')
    })

    await invokeLambda({
      name: 'my-function',
      payload: { data: 'test' },
    })

    expect(capturedCommand?.input.InvocationType).toBeUndefined()
  })

  test('should use custom endpoint when offline and customEndpoint is true', async () => {
    const originalEnv = process.env
    process.env = { ...originalEnv, IS_OFFLINE: 'true' }

    const clientSpy = mockLambdaSend(() => Promise.resolve('ok'))

    await invokeLambda({
      name: 'my-function',
      payload: {},
      customEndpoint: true,
    })

    expect(clientSpy).toHaveBeenCalled()
    process.env = originalEnv
  })

  test('should serialize payload as JSON buffer', async () => {
    let capturedCommand: InvokeCommand | undefined

    mockLambdaSend((command) => {
      capturedCommand = command
      return Promise.resolve('ok')
    })

    const payload = { chatId: 123, text: 'hello' }
    await invokeLambda({ name: 'fn', payload })

    const decoded = JSON.parse(
      Buffer.from(capturedCommand?.input.Payload as Buffer).toString(),
    )
    expect(decoded).toEqual(payload)
  })

  test('should reuse lambda client for the same region and endpoint', async () => {
    const clients = new Set<LambdaClient>()

    mockLambdaSend(function (this: LambdaClient) {
      clients.add(this)
      return Promise.resolve('ok')
    })

    await invokeLambda({ name: 'fn-one', payload: {} })
    await invokeLambda({ name: 'fn-two', payload: {} })

    expect(clients.size).toBe(1)
  })
})
