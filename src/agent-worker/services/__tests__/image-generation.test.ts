import { createOpenAI } from '@ai-sdk/openai'
import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { runWithToolContext } from '../../tools/context'
import {
  GIF_TOOL_TIMEOUT_MS,
  generateAgentGif,
  generateAgentImage,
  getGifFrameSize,
  getGifTiming,
  IMAGE_TOOL_TIMEOUT_MS,
} from '../image-generation'

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
    _options?: { model?: string; timeoutMs?: number },
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
    'uses Gemini Lite for ordinary requests (%s)',
    async (command) => {
      expect(await run(command)).toEqual(png)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(common.generateGeminiImage).toHaveBeenCalledWith(
        expect.stringContaining('draw a fox'),
        undefined,
        {
          model: common.GEMINI_FLASH_LITE_IMAGE_MODEL.model,
          timeoutMs: 55_000,
        },
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
          model: 'gpt-image-2.6-sunburst',
          quality: 'medium',
        }),
      )
      expect(common.generateGeminiImage).not.toHaveBeenCalled()
    },
  )

  test('uses Nano Banana 2.1 directly for /ge', async () => {
    expect(await run('ge')).toEqual(png)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(common.generateGeminiImage).toHaveBeenCalledTimes(1)
    expect(common.generateGeminiImage).toHaveBeenCalledWith(
      expect.stringContaining('draw a fox'),
      undefined,
      { model: 'gemini-nano-banana-2.1', timeoutMs: 110_000 },
    )
    expect(common.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-nano-banana-2.1',
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
        command ? 'gpt-image-2.6-sunburst' : 'gpt-image-2.6-flare',
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
        {
          model: common.GEMINI_FLASH_LITE_IMAGE_MODEL.model,
          timeoutMs: 55_000,
        },
      )
      const form = fetchMock.mock.calls[0]?.[1]?.body as FormData
      expect(form.get('model')).toBe('gpt-image-2.6-flare')
      expect(form.get('quality')).toBe('low')
      expect(common.generateGeminiImage).toHaveBeenCalledTimes(1)
      expect(geminiMock.mock.calls[0]?.[0]).toBe(form.get('prompt'))
      expect(common.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-image-2.6-flare',
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

describe('agent GIF generation', () => {
  const gif = Buffer.from('GIF89a')
  const timing = { frameCount: 16, frameDurationMs: 80 }
  const gifFetch = jest.fn(async (_url: unknown, _init?: RequestInit) =>
    Response.json({ created: 1, data: [{ b64_json: gif.toString('base64') }] }),
  )
  const rejected = (message: string) =>
    Response.json(
      { error: { message, param: 'frame_count', code: 'invalid_value' } },
      { status: 400 },
    )
  const requestBody = (call: number) =>
    JSON.parse(String(gifFetch.mock.calls[call]?.[1]?.body))

  function runGif(commandName?: string) {
    return runWithToolContext(
      message,
      undefined,
      () => generateAgentGif('a cat waving', timing),
      undefined,
      commandName,
    )
  }

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-key'
    gifFetch.mockClear()
    jest.spyOn(globalThis, 'fetch').mockImplementation(gifFetch as typeof fetch)
    jest.spyOn(common.logger, 'info').mockImplementation(() => {})
    jest.spyOn(common.logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => jest.restoreAllMocks())

  test.each([undefined, 'q', 'gif'])(
    'generates every GIF with Sunburst medium (%s)',
    async (command) => {
      expect(await runGif(command)).toEqual({ gif, timing })
      expect(gifFetch).toHaveBeenCalledTimes(1)
      expect(String(gifFetch.mock.calls[0]?.[0])).toBe(
        'https://api.openai.com/v1/images/generations',
      )
      expect(requestBody(0)).toEqual({
        model: 'gpt-image-2.6-sunburst',
        prompt: expect.stringContaining('a cat waving'),
        n: 1,
        quality: 'medium',
        output_format: 'gif',
        frame_count: 16,
        frame_duration_ms: 80,
        size: '720x720',
      })
      expect(common.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'gif_generation',
          model: 'openai/gpt-image-2.6-sunburst',
        }),
        'tool.model_call',
      )
    },
  )

  test('retries a rejected request with the API timing and logs why', async () => {
    gifFetch.mockResolvedValueOnce(rejected('frame_count is too large'))

    expect(await runGif()).toEqual({
      gif,
      timing: { frameCount: 9, frameDurationMs: 200 },
    })
    expect(gifFetch).toHaveBeenCalledTimes(2)
    const retry = requestBody(1)
    expect(retry).not.toHaveProperty('frame_count')
    expect(retry).not.toHaveProperty('frame_duration_ms')
    expect(retry).not.toHaveProperty('size')
    expect(retry).toEqual(expect.objectContaining({ output_format: 'gif' }))
    expect(common.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        frameCount: 16,
        frameDurationMs: 80,
        error: expect.objectContaining({
          message: 'frame_count is too large',
          param: 'frame_count',
        }),
      }),
      'gif_gen.timing_fallback',
    )
  })

  test('surfaces the API error when the retry is rejected too', async () => {
    gifFetch
      .mockResolvedValueOnce(rejected('frame_count is too large'))
      .mockResolvedValueOnce(rejected('Your request was rejected'))
    await expect(runGif()).rejects.toThrow('Your request was rejected')
    expect(gifFetch).toHaveBeenCalledTimes(2)
  })

  test('does not retry a server error', async () => {
    gifFetch.mockResolvedValueOnce(
      Response.json({ error: { message: 'overloaded' } }, { status: 503 }),
    )
    await expect(runGif()).rejects.toThrow('overloaded')
    expect(gifFetch).toHaveBeenCalledTimes(1)
  })

  test('rejects an empty result', async () => {
    gifFetch.mockResolvedValueOnce(Response.json({ created: 1, data: [] }))
    await expect(runGif()).rejects.toThrow('returned no GIF')
  })

  test('bounds both attempts within the tool budget', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout')
    gifFetch.mockResolvedValueOnce(rejected('frame_count is too large'))
    await runGif()
    expect(timeout).toHaveBeenCalledTimes(1)
    expect(timeout.mock.calls[0]?.[0]).toBeLessThan(GIF_TOOL_TIMEOUT_MS)
    expect(gifFetch.mock.calls[1]?.[1]?.signal).toBe(
      gifFetch.mock.calls[0]?.[1]?.signal,
    )
  })
})

describe('getGifFrameSize', () => {
  test.each([
    [2, '1024x1024'],
    [9, '960x960'],
    [16, '720x720'],
  ])('fits %i frames into the pixel budget as %s', (frames, size) => {
    expect(getGifFrameSize(frames)).toBe(size)
    const edge = Number(size.split('x')[0])
    expect(edge % 16).toBe(0)
    expect(frames * edge * edge).toBeLessThanOrEqual(3840 * 2160)
  })
})

describe('getGifTiming', () => {
  test('defaults to a smooth 16-frame loop', () => {
    expect(getGifTiming()).toEqual({ frameCount: 16, frameDurationMs: 80 })
    expect(getGifTiming('48', Number.NaN)).toEqual({
      frameCount: 16,
      frameDurationMs: 80,
    })
  })

  test('keeps requested timing on the API grid', () => {
    expect(getGifTiming(16, 42)).toEqual({
      frameCount: 16,
      frameDurationMs: 40,
    })
    expect(getGifTiming(12.4, 125)).toEqual({
      frameCount: 12,
      frameDurationMs: 130,
    })
  })

  test('clamps timing to the API limits', () => {
    expect(getGifTiming(1, 5)).toEqual({ frameCount: 2, frameDurationMs: 20 })
    expect(getGifTiming(24, 9000)).toEqual({
      frameCount: 16,
      frameDurationMs: 2000,
    })
  })
})
