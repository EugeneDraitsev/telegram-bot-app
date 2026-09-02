import { type InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { invokeLambda, invokeLambdaForBuffer } from '..'

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

describe('invokeLambdaForBuffer', () => {
  function reply(payload: Record<string, unknown>) {
    return { Payload: new TextEncoder().encode(JSON.stringify(payload)) }
  }

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('should decode a base64 body', async () => {
    mockLambdaSend(() =>
      Promise.resolve(
        reply({ statusCode: 200, body: Buffer.from('png').toString('base64') }),
      ),
    )

    expect(
      await invokeLambdaForBuffer({
        label: 'renderer',
        name: 'fn',
        payload: {},
      }),
    ).toEqual(Buffer.from('png'))
  })

  test("should surface the callee's own error", async () => {
    mockLambdaSend(() =>
      Promise.resolve(
        reply({ statusCode: 400, body: JSON.stringify({ error: 'bad svg' }) }),
      ),
    )

    await expect(
      invokeLambdaForBuffer({ label: 'renderer', name: 'fn', payload: {} }),
    ).rejects.toThrow('bad svg')
  })

  test('should reject an unusable response', async () => {
    mockLambdaSend(() => Promise.resolve({ FunctionError: 'Unhandled' }))
    await expect(
      invokeLambdaForBuffer({ label: 'renderer', name: 'fn', payload: {} }),
    ).rejects.toThrow('Unhandled')

    mockLambdaSend(() => Promise.resolve(reply({ statusCode: 200, body: '' })))
    await expect(
      invokeLambdaForBuffer({
        label: 'video trimmer',
        name: 'fn',
        payload: {},
      }),
    ).rejects.toThrow('video trimmer returned an empty body')

    mockLambdaSend(() => Promise.resolve(reply({ statusCode: 500 })))
    await expect(
      invokeLambdaForBuffer({
        label: 'video trimmer',
        name: 'fn',
        payload: {},
      }),
    ).rejects.toThrow('video trimmer failed')
  })
})
