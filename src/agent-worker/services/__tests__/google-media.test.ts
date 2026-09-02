const mockGenerateText = jest.fn()

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

import { type InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

import { type MediaBuffer, resetAiSdkProvidersForTests } from '@tg-bot/common'
import {
  generateLyriaMusic,
  generateOmniVideo,
  LYRIA_3_CLIP_MODEL,
  OMNI_VIDEO_MODEL,
  prepareLyriaMedia,
  prepareOmniMedia,
  shortenOmniVideos,
} from '../google-media'

const originalGeminiApiKey = process.env.GEMINI_API_KEY
const originalGoogleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

function omniResponse(value: string) {
  return new Response(
    JSON.stringify({
      id: 'v1_1',
      status: 'completed',
      steps: [
        { type: 'thought', content: [{ type: 'thought', text: 'planning' }] },
        {
          type: 'model_output',
          content: [
            {
              type: 'video',
              mime_type: 'video/mp4',
              data: Buffer.from(value).toString('base64'),
            },
          ],
        },
      ],
    }),
    { headers: { 'content-type': 'application/json' } },
  )
}

function lastInteractionRequest() {
  const call = mockFetch.mock.calls[0] as [string, RequestInit] | undefined
  if (!call) throw new Error('Expected an interactions request')
  return {
    url: call[0],
    headers: call[1].headers as Record<string, string>,
    body: JSON.parse(String(call[1].body)) as Record<string, unknown>,
  }
}

function generatedMusic(value: string) {
  return {
    files: [],
    providerMetadata: {},
    response: {
      body: {
        id: 'interaction-3',
        model: LYRIA_3_CLIP_MODEL,
        outputs: [
          { type: 'text', text: '[Verse]\nHello' },
          {
            type: 'audio',
            mime_type: 'audio/mpeg',
            data: Buffer.from(value).toString('base64'),
          },
        ],
      },
    },
    text: undefined,
  }
}

const mockFetch = jest.fn<
  Promise<Response>,
  [input: string, init: RequestInit]
>()

describe('Google media through the AI SDK', () => {
  let fetchSpy: ReturnType<typeof jest.spyOn>

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    resetAiSdkProvidersForTests()
    mockGenerateText.mockReset()
    mockFetch.mockReset()
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(mockFetch as unknown as typeof fetch)
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  afterAll(() => {
    if (originalGeminiApiKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = originalGeminiApiKey
    }
    if (originalGoogleApiKey === undefined) {
      delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    } else {
      process.env.GOOGLE_GENERATIVE_AI_API_KEY = originalGoogleApiKey
    }
    resetAiSdkProvidersForTests()
  })

  test('generates a 360p image-to-video Omni clip with native audio', async () => {
    mockFetch.mockResolvedValue(omniResponse('generated-video'))

    const result = await generateOmniVideo({
      prompt: ' A fox runs through neon snow ',
      aspectRatio: '9:16',
      durationSeconds: 8,
      media: [
        {
          buffer: Buffer.from('image'),
          mimeType: 'image/png',
          mediaType: 'image',
        },
      ],
    })

    const request = lastInteractionRequest()
    expect(request.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
    )
    expect(request.headers['x-goog-api-key']).toBe('test-key')
    expect(request.body).toEqual({
      model: OMNI_VIDEO_MODEL,
      input: [
        { type: 'image', mime_type: 'image/png', data: 'aW1hZ2U=' },
        { type: 'text', text: 'A fox runs through neon snow' },
      ],
      response_format: {
        type: 'video',
        aspect_ratio: '9:16',
        resolution: '360p',
        duration: '8s',
      },
      store: false,
    })
    expect(result).toEqual({
      buffer: Buffer.from('generated-video'),
      mimeType: 'video/mp4',
    })
  })

  test('sends a selected video as an editable video input', async () => {
    mockFetch.mockResolvedValue(omniResponse('edited-video'))

    await generateOmniVideo({
      prompt: 'Make it anime. Keep everything else the same.',
      aspectRatio: '16:9',
      durationSeconds: 10,
      media: [
        {
          buffer: Buffer.from('clip'),
          mimeType: 'video/mp4',
          mediaType: 'video',
        },
      ],
    })

    const request = lastInteractionRequest()
    expect(request.body.input).toEqual([
      { type: 'video', mime_type: 'video/mp4', data: 'Y2xpcA==' },
      { type: 'text', text: 'Make it anime. Keep everything else the same.' },
    ])
    expect(request.body.response_format).toEqual({
      type: 'video',
      aspect_ratio: '16:9',
      resolution: '360p',
      duration: '10s',
    })
  })

  test('reports failed Omni interactions', async () => {
    mockFetch.mockResolvedValue(
      new Response('{"error":{"message":"unsupported region"}}', {
        status: 400,
        statusText: 'Bad Request',
      }),
    )

    await expect(
      generateOmniVideo({
        prompt: 'Continue the scene',
        aspectRatio: '9:16',
        durationSeconds: 8,
      }),
    ).rejects.toThrow('Google media generation failed')
  })

  test('strictly validates explicitly selected Omni media', () => {
    const largeImage: MediaBuffer = {
      buffer: Buffer.alloc(15 * 1024 * 1024, 1),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }
    const excludedAudio: MediaBuffer = {
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
      mediaType: 'audio',
    }
    const twoVideos: MediaBuffer[] = [1, 2].map((index) => ({
      buffer: Buffer.from(`clip-${index}`),
      mimeType: 'video/mp4',
      mediaType: 'video',
    }))
    const fourImages: MediaBuffer[] = [1, 2, 3, 4].map((index) => ({
      buffer: Buffer.from(`small-${index}`),
      mimeType: 'image/png',
      mediaType: 'image',
      origin: 'history',
    }))

    expect(() => prepareOmniMedia([excludedAudio], true)).toThrow(
      'does not support selected audio media',
    )
    expect(() => prepareOmniMedia(twoVideos, true)).toThrow(
      'accepts at most one selected video',
    )
    expect(() => prepareOmniMedia(fourImages, true)).toThrow(
      'accepts at most 3 selected media items',
    )
    expect(() => prepareOmniMedia([largeImage], true)).toThrow(
      'selected media exceeds the 14 MiB raw inline limit',
    )
  })

  test('rejects media Omni cannot use before a paid generation', () => {
    const longVideo: MediaBuffer = {
      buffer: Buffer.from('long-clip'),
      mimeType: 'video/mp4',
      mediaType: 'video',
      durationSeconds: 63,
    }
    const gif: MediaBuffer = {
      buffer: Buffer.from('gif'),
      mimeType: 'image/gif',
      mediaType: 'image',
    }
    const shortVideo: MediaBuffer = {
      buffer: Buffer.from('clip'),
      mimeType: 'video/mp4',
      mediaType: 'video',
      durationSeconds: 10,
    }

    for (const explicit of [true, false]) {
      expect(() => prepareOmniMedia([longVideo], explicit)).toThrow(
        'can only edit or extend videos up to 10 seconds; the selected video is 63 seconds',
      )
      expect(() => prepareOmniMedia([gif], explicit)).toThrow(
        'does not accept image/gif media',
      )
    }

    // Videos at the limit, and videos Telegram gave no duration for, still pass
    expect(prepareOmniMedia([shortVideo], true)).toEqual([shortVideo])
    expect(
      prepareOmniMedia(
        [
          {
            buffer: Buffer.from('clip'),
            mimeType: 'video/mp4',
            mediaType: 'video',
          },
        ],
        true,
      ),
    ).toHaveLength(1)
  })

  test('soft-bounds implicit Omni media to the newest items that fit', () => {
    const fiveImages: MediaBuffer[] = [1, 2, 3, 4, 5].map((index) => ({
      buffer: Buffer.from(`small-${index}`),
      mimeType: 'image/png',
      mediaType: 'image',
    }))
    expect(prepareOmniMedia(fiveImages, false)).toEqual(fiveImages.slice(-3))

    const image: MediaBuffer = fiveImages[0] as MediaBuffer
    const olderVideo: MediaBuffer = {
      buffer: Buffer.from('older-clip'),
      mimeType: 'video/mp4',
      mediaType: 'video',
    }
    const newestVideo: MediaBuffer = {
      buffer: Buffer.from('newest-clip'),
      mimeType: 'video/mp4',
      mediaType: 'video',
    }
    expect(prepareOmniMedia([image, olderVideo, newestVideo], false)).toEqual([
      image,
      newestVideo,
    ])

    const newestLarge: MediaBuffer = {
      buffer: Buffer.alloc(15 * 1024 * 1024, 2),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }
    expect(prepareOmniMedia([image, newestLarge], false)).toEqual([image])
  })

  test('forwards selected current and history images and extracts Lyria audio', async () => {
    mockGenerateText.mockResolvedValue(generatedMusic('generated-music'))

    const result = await generateLyriaMusic({
      prompt: ' Cheerful synth pop ',
      model: LYRIA_3_CLIP_MODEL,
      media: [
        {
          buffer: Buffer.from('current-image'),
          mimeType: 'image/png',
          mediaType: 'image',
        },
        {
          buffer: Buffer.from('history-image'),
          mimeType: 'image/jpeg',
          mediaType: 'image',
          origin: 'history',
        },
      ],
    })

    expect(mockGenerateText).toHaveBeenCalledWith({
      model: expect.objectContaining({ modelId: LYRIA_3_CLIP_MODEL }),
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: Buffer.from('current-image'),
              mediaType: 'image/png',
            },
            {
              type: 'file',
              data: Buffer.from('history-image'),
              mediaType: 'image/jpeg',
            },
            { type: 'text', text: 'Cheerful synth pop' },
          ],
        },
      ],
      maxRetries: 0,
      timeout: 160_000,
      include: { responseBody: true },
      providerOptions: {
        google: { store: false, responseModalities: ['audio'] },
      },
    })
    expect(result).toEqual({
      buffer: Buffer.from('generated-music'),
      mimeType: 'audio/mpeg',
      text: '[Verse]\nHello',
    })
  })

  test('strictly validates explicitly selected Lyria media', () => {
    const firstImage: MediaBuffer = {
      buffer: Buffer.alloc(8 * 1024 * 1024, 1),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }
    const secondLargeImage: MediaBuffer = {
      buffer: Buffer.alloc(8 * 1024 * 1024, 2),
      mimeType: 'image/png',
      mediaType: 'image',
    }
    const excludedAudio: MediaBuffer = {
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
      mediaType: 'audio',
    }
    const elevenImages: MediaBuffer[] = Array.from(
      { length: 11 },
      (_, index) => ({
        buffer: Buffer.from(`small-${index}`),
        mimeType: 'image/png',
        mediaType: 'image',
        origin: 'history',
      }),
    )

    expect(() => prepareLyriaMedia([excludedAudio], true)).toThrow(
      'does not support selected audio media',
    )
    expect(() => prepareLyriaMedia(elevenImages, true)).toThrow(
      'accepts at most 10 selected media items',
    )
    expect(() =>
      prepareLyriaMedia([firstImage, secondLargeImage], true),
    ).toThrow('selected media exceeds the 14 MiB raw inline limit')
    expect(prepareLyriaMedia(elevenImages, false)).toEqual(
      elevenImages.slice(-10),
    )
  })

  test('fails clearly without an API key or generated media', async () => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY

    await expect(
      generateLyriaMusic({
        prompt: 'Ambient loop',
        model: LYRIA_3_CLIP_MODEL,
      }),
    ).rejects.toThrow('Google media generation failed')

    process.env.GEMINI_API_KEY = 'test-key'
    mockFetch.mockResolvedValue(omniResponse(''))
    await expect(
      generateOmniVideo({
        prompt: 'Ocean at sunset',
        aspectRatio: '16:9',
        durationSeconds: 6,
      }),
    ).rejects.toThrow('Gemini Omni Flash returned no video output')
  })
})

describe('Omni input video trimming', () => {
  const longVideoNote: MediaBuffer = {
    buffer: Buffer.from('sixty-second-circle'),
    mimeType: 'video/mp4',
    mediaType: 'video',
    fileId: 'file-1',
    durationSeconds: 60,
  }

  function mockTrimmer(
    implementation: (command: InvokeCommand) => unknown,
  ): void {
    jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation(implementation as never)
  }

  function trimmerReply(video: string) {
    return {
      Payload: new TextEncoder().encode(
        JSON.stringify({
          statusCode: 200,
          isBase64Encoded: true,
          body: Buffer.from(video).toString('base64'),
        }),
      ),
    }
  }

  beforeEach(() => {
    process.env.VIDEO_TRIMMER_FUNCTION_NAME = 'telegram-test-video-trimmer'
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.VIDEO_TRIMMER_FUNCTION_NAME
  })

  test('keeps a long Telegram video so it can be shortened later', () => {
    expect(prepareOmniMedia([longVideoNote], true)).toEqual([longVideoNote])
  })

  test('charges a long video the size it will have after the trim', () => {
    // Over the 14 MiB inline limit now, comfortably under it once trimmed.
    const heavyLongVideo: MediaBuffer = {
      ...longVideoNote,
      buffer: Buffer.alloc(15 * 1024 * 1024),
    }
    const heavyShortVideo: MediaBuffer = {
      ...heavyLongVideo,
      durationSeconds: 8,
    }

    expect(prepareOmniMedia([heavyLongVideo], true)).toEqual([heavyLongVideo])
    expect(prepareOmniMedia([heavyLongVideo], false)).toEqual([heavyLongVideo])

    // A short video is not trimmable, so its real weight still applies.
    expect(() => prepareOmniMedia([heavyShortVideo], true)).toThrow(
      'selected media exceeds the 14 MiB raw inline limit',
    )
    expect(prepareOmniMedia([heavyShortVideo], false)).toEqual([])
  })

  test('replaces a long video with its trimmed first seconds', async () => {
    let command: InvokeCommand | undefined
    mockTrimmer((invoke) => {
      command = invoke
      return Promise.resolve(trimmerReply('ten-seconds'))
    })

    const image: MediaBuffer = {
      buffer: Buffer.from('image'),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }

    expect(await shortenOmniVideos([image, longVideoNote], '9:16')).toEqual([
      image,
      {
        ...longVideoNote,
        buffer: Buffer.from('ten-seconds'),
        durationSeconds: 10,
        width: undefined,
        height: undefined,
      },
    ])
    expect(command?.input.FunctionName).toBe('telegram-test-video-trimmer')
    // Omni only outputs 9:16 or 16:9, so the input is cropped to the same frame.
    expect(JSON.parse(String(command?.input.Payload))).toEqual({
      fileId: 'file-1',
      maxDurationSeconds: 10,
      aspectRatio: '9:16',
    })
  })

  test('leaves short videos and non-Telegram media untouched', async () => {
    const send = jest
      .spyOn(LambdaClient.prototype, 'send')
      .mockImplementation((() => Promise.resolve(trimmerReply('x'))) as never)

    const shortVideo: MediaBuffer = { ...longVideoNote, durationSeconds: 9 }
    const withoutFileId: MediaBuffer = { ...longVideoNote, fileId: undefined }

    expect(
      await shortenOmniVideos([shortVideo, withoutFileId], '16:9'),
    ).toEqual([shortVideo, withoutFileId])
    expect(send).not.toHaveBeenCalled()
  })

  test('reports a failed trim instead of generating from a long video', async () => {
    mockTrimmer(() =>
      Promise.resolve({
        Payload: new TextEncoder().encode(
          JSON.stringify({
            statusCode: 400,
            body: JSON.stringify({ error: 'ffmpeg exited with 1' }),
          }),
        ),
      }),
    )

    await expect(shortenOmniVideos([longVideoNote], '9:16')).rejects.toThrow(
      'Could not shorten the selected video to 10 seconds',
    )
  })
})
