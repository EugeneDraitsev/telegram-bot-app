import { type InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { invokeAgentLambda, invokeLambda, invokeReplyLambda } from '..'

describe('invokeLambda', () => {
  test('should call lambda with provided options', async () => {
    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation(() => 'lambda response!!')

    const options = {
      FunctionName: `screenshot-service-${process.env.stage}-png`,
    }
    expect(await invokeLambda('name', options)).toEqual('lambda response!!')
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
})
