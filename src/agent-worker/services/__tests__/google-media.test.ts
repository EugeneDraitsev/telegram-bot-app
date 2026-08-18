const mockGenerateText = jest.fn()

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

import { type MediaBuffer, resetAiSdkProvidersForTests } from '@tg-bot/common'
import {
  GEMINI_OMNI_FLASH_MODEL,
  generateLyriaMusic,
  generateOmniVideo,
  LYRIA_3_CLIP_MODEL,
  prepareLyriaMedia,
  prepareOmniMedia,
} from '../google-media'

const originalGeminiApiKey = process.env.GEMINI_API_KEY
const originalGoogleApiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY

function generatedVideo(value: string) {
  return {
    files: [
      {
        mediaType: 'video/mp4',
        uint8Array: new Uint8Array(Buffer.from(value)),
      },
    ],
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

  test('generates an image-referenced Omni video', async () => {
    mockGenerateText.mockResolvedValue(generatedVideo('generated-video'))

    const result = await generateOmniVideo({
      prompt: 'A fox runs through neon snow',
      aspectRatio: '9:16',
      durationSeconds: 5,
      media: [
        {
          buffer: Buffer.from('image'),
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
      model: expect.objectContaining({
        modelId: GEMINI_OMNI_FLASH_MODEL,
        provider: 'google.generative-ai.interactions',
      }),
      prompt: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: Buffer.from('image'),
              mediaType: 'image/png',
            },
            {
              type: 'file',
              data: Buffer.from('history-image'),
              mediaType: 'image/jpeg',
            },
            {
              type: 'text',
              text: 'A fox runs through neon snow',
            },
          ],
        },
      ],
      maxRetries: 0,
      timeout: 160_000,
      providerOptions: {
        google: { store: false, responseModalities: ['video'] },
      },
    })
    expect(result).toEqual({
      buffer: Buffer.from('generated-video'),
      mimeType: 'video/mp4',
    })
  })

  test('passes an attached video as an Omni edit input', async () => {
    mockGenerateText.mockResolvedValue(generatedVideo('edited-video'))

    await generateOmniVideo({
      prompt: 'Make it snow',
      aspectRatio: '16:9',
      durationSeconds: 3,
      media: [
        {
          buffer: Buffer.from('source-video'),
          mimeType: 'video/mp4',
          mediaType: 'video',
        },
      ],
    })

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        timeout: 160_000,
        prompt: [
          {
            role: 'user',
            content: [
              expect.objectContaining({
                type: 'file',
                mediaType: 'video/mp4',
              }),
              expect.objectContaining({
                type: 'text',
                text: expect.stringContaining('Make it snow'),
              }),
            ],
          },
        ],
      }),
    )
  })

  test('strictly validates explicitly selected Omni media', () => {
    const largeImage: MediaBuffer = {
      buffer: Buffer.alloc(8 * 1024 * 1024, 1),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }
    const excludedAudio: MediaBuffer = {
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
      mediaType: 'audio',
    }
    const largeVideo: MediaBuffer = {
      buffer: Buffer.alloc(8 * 1024 * 1024, 2),
      mimeType: 'video/mp4',
      mediaType: 'video',
    }
    const fiveImages: MediaBuffer[] = [1, 2, 3, 4, 5].map((index) => ({
      buffer: Buffer.from(`small-${index}`),
      mimeType: 'image/png',
      mediaType: 'image',
      origin: 'history',
    }))

    expect(() => prepareOmniMedia([excludedAudio], true)).toThrow(
      'does not support selected audio media',
    )
    expect(() => prepareOmniMedia(fiveImages, true)).toThrow(
      'accepts at most 4 selected media items',
    )
    expect(() => prepareOmniMedia([largeImage, largeVideo], true)).toThrow(
      'selected media exceeds the 14 MiB raw inline limit',
    )
  })

  test('soft-bounds implicit Omni media to the newest items that fit', () => {
    const fiveImages: MediaBuffer[] = [1, 2, 3, 4, 5].map((index) => ({
      buffer: Buffer.from(`small-${index}`),
      mimeType: 'image/png',
      mediaType: 'image',
    }))
    expect(prepareOmniMedia(fiveImages, false)).toEqual(fiveImages.slice(-4))

    const oldestSmall = fiveImages[0]
    const olderLarge: MediaBuffer = {
      buffer: Buffer.alloc(8 * 1024 * 1024, 1),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }
    const newestLarge: MediaBuffer = {
      buffer: Buffer.alloc(8 * 1024 * 1024, 2),
      mimeType: 'video/mp4',
      mediaType: 'video',
    }
    expect(
      prepareOmniMedia([oldestSmall, olderLarge, newestLarge], false),
    ).toEqual([oldestSmall, newestLarge])
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
    mockGenerateText.mockResolvedValue({ files: [], providerMetadata: {} })
    await expect(
      generateOmniVideo({
        prompt: 'Ocean at sunset',
        aspectRatio: '16:9',
        durationSeconds: 5,
      }),
    ).rejects.toThrow('Gemini Omni returned no video output')
  })
})
