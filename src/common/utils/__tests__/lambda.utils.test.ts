import { type InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { invokeAgentLambda, invokeLambda, invokeReplyLambda } from '..'

describe('invokeLambda', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('should call lambda with provided options', async () => {
    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation(() => 'lambda response!!')

    expect(
      await invokeLambda({
        name: 'my-function',
        payload: { key: 'value' },
      }),
    ).toEqual('lambda response!!')
  })

  test('should set InvocationType to Event when async is true', async () => {
    let capturedCommand: InvokeCommand | undefined

    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation((command: InvokeCommand) => {
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

    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation((command: InvokeCommand) => {
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

    const clientSpy = jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation(() => Promise.resolve('ok'))

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

    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation((command: InvokeCommand) => {
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
})

describe('invokeReplyLambda', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv, REPLY_WORKER_FUNCTION_NAME: 'test-worker' }
  })

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  test('should remove imagesData from payload to avoid exceeding 6MB limit', async () => {
    let capturedPayload: Buffer | undefined

    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation((command: InvokeCommand) => {
        capturedPayload = command.input.Payload as Buffer
        return Promise.resolve('lambda response!!')
      })

    const payload = {
      combinedText: 'test text',
      imagesData: [
        Buffer.from('large image data 1'),
        Buffer.from('large image data 2'),
      ],
      replyId: 123,
      chatId: 456,
      message: { text: 'test' },
    }

    await invokeReplyLambda(payload)

    expect(capturedPayload).toBeDefined()
    const parsedPayload = JSON.parse(capturedPayload?.toString() ?? '')

    expect(parsedPayload).not.toHaveProperty('imagesData')
    expect(parsedPayload).toHaveProperty('combinedText', 'test text')
    expect(parsedPayload).toHaveProperty('replyId', 123)
    expect(parsedPayload).toHaveProperty('chatId', 456)
    expect(parsedPayload).toHaveProperty('message')
  })

  test('should invoke lambda with async mode', async () => {
    let capturedCommand: InvokeCommand | undefined

    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation((command: InvokeCommand) => {
        capturedCommand = command
        return Promise.resolve('ok')
      })

    await invokeReplyLambda({ text: 'test' })

    expect(capturedCommand?.input.InvocationType).toBe('Event')
    expect(capturedCommand?.input.FunctionName).toBe('test-worker')
  })
})

describe('invokeAgentLambda', () => {
  const originalEnv = process.env

  afterEach(() => {
    process.env = originalEnv
    jest.restoreAllMocks()
  })

  test('should throw clear error when function name is missing', () => {
    process.env = { ...originalEnv, AGENT_WORKER_FUNCTION_NAME: '' }

    expect(() =>
      invokeAgentLambda({
        chatId: 123,
        message: { text: 'hello' },
      }),
    ).toThrow('AGENT_WORKER_FUNCTION_NAME is not set')
  })

  test('should invoke lambda with async mode and strip imagesData', async () => {
    process.env = { ...originalEnv, AGENT_WORKER_FUNCTION_NAME: 'agent-worker' }

    let capturedCommand: InvokeCommand | undefined

    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation((command: InvokeCommand) => {
        capturedCommand = command
        return Promise.resolve('ok')
      })

    await invokeAgentLambda({
      message: { text: 'hello' },
      imagesData: [Buffer.from('image')],
    })

    expect(capturedCommand?.input.InvocationType).toBe('Event')
    expect(capturedCommand?.input.FunctionName).toBe('agent-worker')

    const parsed = JSON.parse(
      Buffer.from(capturedCommand?.input.Payload as Buffer).toString(),
    )
    expect(parsed).not.toHaveProperty('imagesData')
    expect(parsed).toHaveProperty('message')
  })
})
