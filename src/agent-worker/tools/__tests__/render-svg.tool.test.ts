import { type InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'
import type { Message } from 'grammy/types'

import { getCollectedResponses, runWithToolContext } from '../context'
import { renderSvgTool } from '../render-svg.tool'

type LambdaSend = LambdaClient['send']

const TEST_MESSAGE = {
  chat: { id: 1 },
  message_id: 1,
} as Message

const mockLambdaSend = (
  implementation: (this: LambdaClient, command: InvokeCommand) => unknown,
) =>
  jest
    .spyOn(LambdaClient.prototype, 'send')
    .mockImplementation(implementation as unknown as LambdaSend)

const executeTool = (args: Record<string, unknown>) =>
  runWithToolContext(TEST_MESSAGE, undefined, async () => {
    const result = await renderSvgTool.execute(args)
    return { result, responses: getCollectedResponses() }
  })

describe('renderSvgTool', () => {
  beforeEach(() => {
    process.env.SHARP_RENDERER_FUNCTION_NAME = 'test-sharp-renderer'
  })

  afterEach(() => {
    delete process.env.SHARP_RENDERER_FUNCTION_NAME
    jest.restoreAllMocks()
  })

  test('renders svg through sharp renderer and collects image response', async () => {
    const image = Buffer.from('png')
    let capturedCommand: InvokeCommand | undefined

    mockLambdaSend((command) => {
      capturedCommand = command
      return Promise.resolve({
        Payload: Buffer.from(
          JSON.stringify({
            statusCode: 200,
            body: image.toString('base64'),
          }),
        ),
      })
    })

    const { result, responses } = await executeTool({
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"></svg>',
      caption: 'chart',
      width: 640.4,
      height: 320,
    })

    const payload = JSON.parse(
      Buffer.from(capturedCommand?.input.Payload as Buffer).toString(),
    )

    expect(result).toBe(`Rendered SVG to PNG (${image.byteLength} bytes)`)
    expect(payload).toMatchObject({
      width: 640,
      height: 320,
    })
    expect(capturedCommand?.input.FunctionName).toBe('test-sharp-renderer')
    expect(responses).toHaveLength(1)
    expect(responses[0]).toMatchObject({ type: 'image', caption: 'chart' })
    expect((responses[0] as { buffer?: Buffer }).buffer?.equals(image)).toBe(
      true,
    )
  })

  test('rejects empty svg before invoking renderer', async () => {
    const sendSpy = jest.spyOn(LambdaClient.prototype, 'send')

    await expect(executeTool({ svg: '   ' })).rejects.toThrow(
      'Error rendering SVG: svg cannot be empty',
    )
    expect(sendSpy).not.toHaveBeenCalled()
  })

  test('returns renderer validation errors', async () => {
    mockLambdaSend(() =>
      Promise.resolve({
        Payload: Buffer.from(
          JSON.stringify({
            statusCode: 400,
            error: 'SVG contains unsupported active content',
          }),
        ),
      }),
    )

    await expect(executeTool({ svg: '<svg><script /></svg>' })).rejects.toThrow(
      'Error rendering SVG: SVG contains unsupported active content',
    )
  })
})
