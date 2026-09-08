import { createOpenAI } from '@ai-sdk/openai'
import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { runWithToolContext } from '../../tools/context'
import { generateAgentImage, IMAGE_TOOL_TIMEOUT_MS } from '../image-generation'

const message = { chat: { id: 123 }, message_id: 55 } as Message
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6jOcAAAAASUVORK5CYII=',
  'base64',
)

const fetchMock = jest.fn(async (_url: unknown, _init?: RequestInit) =>
  Response.json({ created: 1, data: [{ b64_json: png.toString('base64') }] }),
)
const geminiMock = jest.fn(
  async (
    _prompt: string,
    _images?: Buffer[],
    _options?: { timeoutMs?: number },
  ) => ({ image: png }),
)

function run(commandName?: string, images?: Buffer[]) {
  return runWithToolContext(
    message,
    undefined,
    () => generateAgentImage('draw a fox', images, commandName),
    undefined,
    commandName,
  )
}

function jsonRequest() {
  return JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
}

describe('agent image generation', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () =>
      Response.json({
        created: 1,
        data: [{ b64_json: png.toString('base64') }],
      }),
    )
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: fetchMock as typeof fetch,
    })
    jest
      .spyOn(common, 'getAiSdkOpenAiImageModel')
      .mockImplementation((model) => provider.image(model))
    geminiMock.mockReset()
    geminiMock.mockResolvedValue({ image: png })
    jest.spyOn(common, 'generateGeminiImage').mockImplementation(geminiMock)
    jest.spyOn(common.logger, 'info').mockImplementation(() => {})
    jest.spyOn(common.logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => jest.restoreAllMocks())

  test.each([undefined, 'q', 'custom'])(
    'uses Gemini for ordinary requests (%s)',
    async (command) => {
      expect(await run(command)).toEqual(png)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(common.generateGeminiImage).toHaveBeenCalledWith(
        expect.stringContaining('draw a fox'),
        undefined,
        { timeoutMs: 55_000 },
      )
      expect(common.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'google/gemini-3.1-flash-lite-image',
        }),
        'tool.model_call',
      )
    },
  )

  test.each(['e', 'ee', 'gp', 'de'])(
    'uses Sunburst medium for /%s',
    async (command) => {
      expect(await run(command)).toEqual(png)
      expect(jsonRequest()).toEqual(
        expect.objectContaining({
          model: 'gpt-image-2.5-sunburst',
          quality: 'medium',
        }),
      )
      expect(common.generateGeminiImage).not.toHaveBeenCalled()
    },
  )

  test('uses Gemini directly for /ge', async () => {
    expect(await run('ge')).toEqual(png)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(common.generateGeminiImage).toHaveBeenCalledTimes(1)
    expect(common.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-3.1-flash-lite-image',
        command: 'ge',
      }),
      'tool.model_call',
    )
  })

  test.each([undefined, 'e'])(
    'edits the selected input through the Images API (%s)',
    async (command) => {
      if (!command)
        geminiMock.mockRejectedValueOnce(new Error('Gemini unavailable'))
      await run(command, [png])
      const form = fetchMock.mock.calls[0]?.[1]?.body as FormData
      expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(/\/images\/edits$/)
      expect(form.get('model')).toBe(
        command ? 'gpt-image-2.5-sunburst' : 'gpt-image-2.5-flare',
      )
      expect(form.get('quality')).toBe(command ? 'medium' : 'low')
      const file = [...form.values()].find(
        (value) => value instanceof Blob,
      ) as Blob
      expect(Buffer.from(await file.arrayBuffer())).toEqual(png)
      expect(common.generateGeminiImage).toHaveBeenCalledTimes(command ? 0 : 1)
    },
  )

  test.each(['error', 'empty', 'timeout'])(
    'falls back to Flare low once when Gemini returns %s, keeping edit inputs and logs',
    async (failure) => {
      if (failure === 'empty') {
        geminiMock.mockResolvedValueOnce({ image: Buffer.alloc(0) })
      } else {
        geminiMock.mockRejectedValueOnce(
          failure === 'timeout'
            ? new DOMException('Gemini timed out', 'TimeoutError')
            : new Error('Gemini unavailable'),
        )
      }

      expect(await run(undefined, [png])).toEqual(png)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(common.generateGeminiImage).toHaveBeenCalledWith(
        expect.stringContaining('draw a fox'),
        [png],
        { timeoutMs: 55_000 },
      )
      const form = fetchMock.mock.calls[0]?.[1]?.body as FormData
      expect(form.get('model')).toBe('gpt-image-2.5-flare')
      expect(form.get('quality')).toBe('low')
      expect(common.generateGeminiImage).toHaveBeenCalledTimes(1)
      expect(geminiMock.mock.calls[0]?.[0]).toBe(form.get('prompt'))
      expect(common.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-image-2.5-flare',
          fallbackFrom: 'google/gemini-3.1-flash-lite-image',
        }),
        'tool.model_call',
      )
    },
  )

  test.each(['e', 'ee', 'gp', 'de'])(
    'does not switch providers after /%s fails',
    async (command) => {
      fetchMock.mockResolvedValueOnce(
        Response.json(
          { error: { message: 'unavailable', type: 'server_error' } },
          { status: 503 },
        ),
      )
      await expect(run(command)).rejects.toThrow('unavailable')
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(common.generateGeminiImage).not.toHaveBeenCalled()
    },
  )

  test('does not switch providers after /ge fails', async () => {
    geminiMock.mockRejectedValueOnce(new Error('Gemini unavailable'))
    await expect(run('ge')).rejects.toThrow('Gemini unavailable')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('propagates the final failure without cycling back to Gemini', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: { message: 'Flare unavailable', type: 'server_error' } },
        { status: 503 },
      ),
    )
    geminiMock.mockRejectedValueOnce(new Error('Gemini unavailable'))
    await expect(run()).rejects.toThrow('Flare unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(common.generateGeminiImage).toHaveBeenCalledTimes(1)
  })

  test('bounds and aborts the fallback request within the tool budget', async () => {
    geminiMock.mockRejectedValueOnce(new Error('Gemini unavailable'))
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(AbortSignal.abort(new Error('image timeout')))
    fetchMock.mockImplementationOnce(async (_url, init) => {
      init?.signal?.throwIfAborted()
      throw new Error('Expected an aborted request')
    })
    try {
      await expect(run()).rejects.toThrow('image timeout')
      expect(timeout).toHaveBeenCalledWith(55_000)
      expect(common.generateGeminiImage).toHaveBeenCalledTimes(1)
      expect(55_000 * 2).toBeLessThan(IMAGE_TOOL_TIMEOUT_MS)
    } finally {
      timeout.mockRestore()
    }
  })
})
