const mockGenerateText = jest.fn()
const mockGenerateVideo = jest.fn()

jest.mock('ai', () => ({
  experimental_generateVideo: (...args: unknown[]) =>
    mockGenerateVideo(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

import { type MediaBuffer, resetAiSdkProvidersForTests } from '@tg-bot/common'
import {
  generateLyriaMusic,
  generateVeoVideo,
  LYRIA_3_CLIP_MODEL,
  prepareLyriaMedia,
  prepareVeoMedia,
  VEO_3_1_LITE_MODEL,
} from '../google-media'

const originalGeminiApiKey = process.env.GEMINI_API_KEY
const originalGoogleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

function generatedVideo(value: string) {
  return {
    video: {
      mediaType: 'video/mp4',
      uint8Array: new Uint8Array(Buffer.from(value)),
    },
    providerMetadata: {},
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

describe('Google media through the AI SDK', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
    resetAiSdkProvidersForTests()
    mockGenerateText.mockReset()
    mockGenerateVideo.mockReset()
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

  test('generates an image-to-video Veo clip with native audio', async () => {
    mockGenerateVideo.mockResolvedValue(generatedVideo('generated-video'))

    const result = await generateVeoVideo({
      prompt: 'A fox runs through neon snow',
      aspectRatio: '9:16',
      durationSeconds: 6,
      media: [
        {
          buffer: Buffer.from('image'),
          mimeType: 'image/png',
          mediaType: 'image',
        },
      ],
    })

    expect(mockGenerateVideo).toHaveBeenCalledWith({
      model: expect.objectContaining({
        modelId: VEO_3_1_LITE_MODEL,
        provider: 'google.generative-ai',
      }),
      prompt: {
        image: 'data:image/png;base64,aW1hZ2U=',
        text: 'A fox runs through neon snow',
      },
      aspectRatio: '9:16',
      resolution: '1280x720',
      duration: 6,
      generateAudio: true,
      maxRetries: 0,
      abortSignal: expect.any(AbortSignal),
      download: expect.any(Function),
      providerOptions: {
        google: { pollTimeoutMs: 160_000 },
      },
    })
    expect(result).toEqual({
      buffer: Buffer.from('generated-video'),
      mimeType: 'video/mp4',
    })
  })

  test('generates a text-only Veo clip', async () => {
    mockGenerateVideo.mockResolvedValue(generatedVideo('generated-video'))

    await generateVeoVideo({
      prompt: 'Ocean at sunset',
      aspectRatio: '16:9',
      durationSeconds: 4,
    })

    expect(mockGenerateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Ocean at sunset',
        aspectRatio: '16:9',
        duration: 4,
      }),
    )
  })

  test('downloads Veo output with native fetch from the Google media endpoint only', async () => {
    mockGenerateVideo.mockResolvedValue(generatedVideo('generated-video'))
    await generateVeoVideo({
      prompt: 'Ocean at sunset',
      aspectRatio: '16:9',
      durationSeconds: 4,
    })

    const call = mockGenerateVideo.mock.calls[0]?.[0] as {
      download?: (options: {
        url: URL
        abortSignal?: AbortSignal
      }) => Promise<{ data: Uint8Array; mediaType: string | undefined }>
    }
    if (!call.download) throw new Error('Expected a custom video downloader')

    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(Buffer.from('downloaded-video'), {
        headers: { 'content-type': 'video/mp4' },
      }),
    )
    try {
      const result = await call.download({
        url: new URL(
          'https://generativelanguage.googleapis.com/v1beta/files/video-1:download?key=secret',
        ),
      })

      expect(result).toEqual({
        data: new Uint8Array(Buffer.from('downloaded-video')),
        mediaType: 'video/mp4',
      })
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.any(URL),
        expect.objectContaining({ redirect: 'error' }),
      )

      await expect(
        call.download({
          url: new URL('https://example.com/v1beta/files/video-1:download'),
        }),
      ).rejects.toThrow('Rejected unexpected Google media download URL')
    } finally {
      fetchSpy.mockRestore()
    }
  })

  test('strictly validates explicitly selected Veo media', () => {
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
    const video: MediaBuffer = {
      buffer: Buffer.from('video'),
      mimeType: 'video/mp4',
      mediaType: 'video',
    }
    const twoImages: MediaBuffer[] = [1, 2].map((index) => ({
      buffer: Buffer.from(`small-${index}`),
      mimeType: 'image/png',
      mediaType: 'image',
      origin: 'history',
    }))

    expect(() => prepareVeoMedia([excludedAudio], true)).toThrow(
      'does not support selected audio media',
    )
    expect(() => prepareVeoMedia([video], true)).toThrow(
      'does not support selected video media',
    )
    expect(() => prepareVeoMedia(twoImages, true)).toThrow(
      'accepts at most 1 selected media items',
    )
    expect(() => prepareVeoMedia([largeImage], true)).toThrow(
      'selected media exceeds the 14 MiB raw inline limit',
    )
  })

  test('soft-bounds implicit Veo media to the newest image that fits', () => {
    const fiveImages: MediaBuffer[] = [1, 2, 3, 4, 5].map((index) => ({
      buffer: Buffer.from(`small-${index}`),
      mimeType: 'image/png',
      mediaType: 'image',
    }))
    expect(prepareVeoMedia(fiveImages, false)).toEqual(fiveImages.slice(-1))

    const newestLarge: MediaBuffer = {
      buffer: Buffer.alloc(15 * 1024 * 1024, 2),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }
    expect(prepareVeoMedia([fiveImages[0], newestLarge], false)).toEqual([
      fiveImages[0],
    ])
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
    mockGenerateVideo.mockResolvedValue(generatedVideo(''))
    await expect(
      generateVeoVideo({
        prompt: 'Ocean at sunset',
        aspectRatio: '16:9',
        durationSeconds: 6,
      }),
    ).rejects.toThrow('Veo 3.1 Lite returned no video output')
  })
})
