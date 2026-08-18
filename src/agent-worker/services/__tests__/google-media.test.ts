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
    providerMetadata: {
      google: {
        interactionId: 'interaction-1',
        outputTokensByModality: { video: 57_920 },
      },
    },
  }
}

function generatedMusic(value: string) {
  return {
    files: [],
    providerMetadata: {
      google: {
        interactionId: 'interaction-3',
        outputTokensByModality: { audio: 12_345 },
      },
    },
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
    text: '',
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
      interactionId: 'interaction-1',
      outputTokensByModality: { video: 57_920 },
    })
  })

  test('passes an attached video as an Omni edit input', async () => {
    mockGenerateText.mockResolvedValue(generatedVideo('edited-video'))

    await generateOmniVideo({
      prompt: 'Make it snow',
      aspectRatio: '16:9',
      durationSeconds: 3,
      timeoutMs: 120_000,
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
        timeout: 120_000,
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

  test('rejects unsupported or oversized Omni media before the provider call', async () => {
    const largeImage: MediaBuffer = {
      buffer: Buffer.alloc(10 * 1024 * 1024, 1),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }
    const excludedAudio: MediaBuffer = {
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
      mediaType: 'audio',
    }
    const largeVideo: MediaBuffer = {
      buffer: Buffer.alloc(10 * 1024 * 1024, 2),
      mimeType: 'video/mp4',
      mediaType: 'video',
    }
    const fiveImages: MediaBuffer[] = [1, 2, 3, 4, 5].map((index) => ({
      buffer: Buffer.from(`small-${index}`),
      mimeType: 'image/png',
      mediaType: 'image',
      origin: 'history',
    }))

    const generate = (media: MediaBuffer[]) =>
      generateOmniVideo({
        prompt: 'Use these exact visual references',
        aspectRatio: '9:16',
        durationSeconds: 5,
        media,
      })

    await expect(generate([excludedAudio])).rejects.toThrow(
      'does not support selected audio media',
    )
    await expect(generate(fiveImages)).rejects.toThrow(
      'accepts at most 4 selected media items',
    )
    await expect(generate([largeImage, largeVideo])).rejects.toThrow(
      'selected media exceeds the 19 MiB inline limit',
    )
    expect(mockGenerateText).not.toHaveBeenCalled()
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
      interactionId: 'interaction-3',
      outputTokensByModality: { audio: 12_345 },
      text: '[Verse]\nHello',
    })
  })

  test('rejects unsupported or oversized Lyria media before the provider call', async () => {
    const firstImage: MediaBuffer = {
      buffer: Buffer.alloc(10 * 1024 * 1024, 1),
      mimeType: 'image/jpeg',
      mediaType: 'image',
    }
    const secondLargeImage: MediaBuffer = {
      buffer: Buffer.alloc(10 * 1024 * 1024, 2),
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

    const generate = (media: MediaBuffer[]) =>
      generateLyriaMusic({
        prompt: 'Use these exact image references',
        model: LYRIA_3_CLIP_MODEL,
        media,
      })

    await expect(generate([excludedAudio])).rejects.toThrow(
      'does not support selected audio media',
    )
    await expect(generate(elevenImages)).rejects.toThrow(
      'accepts at most 10 selected media items',
    )
    await expect(generate([firstImage, secondLargeImage])).rejects.toThrow(
      'selected media exceeds the 19 MiB inline limit',
    )
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  test('fails clearly without an API key or generated media', async () => {
    delete process.env.GEMINI_API_KEY
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY

    await expect(
      generateLyriaMusic({
        prompt: 'Ambient loop',
        model: LYRIA_3_CLIP_MODEL,
      }),
    ).rejects.toThrow(
      'GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is not set',
    )

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
