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
    providerMetadata: { google: { interactionId: 'interaction-1' } },
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
          origin: 'request',
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
              text: expect.stringContaining(
                'exactly 5 seconds of video in 9:16 aspect ratio',
              ),
            },
          ],
        },
      ],
      maxRetries: 0,
      timeout: 160_000,
    })
    expect(result).toEqual({
      buffer: Buffer.from('generated-video'),
      mimeType: 'video/mp4',
      interactionId: 'interaction-1',
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
          origin: 'request',
        },
      ],
    })

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
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

  test('filters and bounds Omni inline media', async () => {
    mockGenerateText.mockResolvedValue(generatedVideo('bounded-video'))
    const largeImage: MediaBuffer = {
      buffer: Buffer.alloc(10 * 1024 * 1024, 1),
      mimeType: 'image/jpeg',
      mediaType: 'image',
      origin: 'request',
    }
    const excludedAudio: MediaBuffer = {
      buffer: Buffer.from('audio'),
      mimeType: 'audio/mpeg',
      mediaType: 'audio',
      origin: 'request',
    }
    const overBudgetVideo: MediaBuffer = {
      buffer: Buffer.alloc(10 * 1024 * 1024, 2),
      mimeType: 'video/mp4',
      mediaType: 'video',
      origin: 'request',
    }
    const smallImages: MediaBuffer[] = [1, 2, 3].map((index) => ({
      buffer: Buffer.from(`small-${index}`),
      mimeType: 'image/png',
      mediaType: 'image',
      origin: 'history',
    }))

    await generateOmniVideo({
      prompt: 'Use the relevant visual references',
      aspectRatio: '9:16',
      durationSeconds: 5,
      media: [largeImage, excludedAudio, overBudgetVideo, ...smallImages],
    })

    const call = mockGenerateText.mock.calls[0]?.[0] as {
      prompt: Array<{
        content: Array<{ type: string; data?: Buffer; mediaType?: string }>
      }>
    }
    const files = call.prompt[0]?.content.filter((part) => part.type === 'file')
    expect(files).toHaveLength(4)
    expect(files?.[0]?.data).toBe(largeImage.buffer)
    expect(files?.some((part) => part.data === excludedAudio.buffer)).toBe(
      false,
    )
    expect(files?.some((part) => part.data === overBudgetVideo.buffer)).toBe(
      false,
    )
    expect(files?.slice(1).map((part) => part.data)).toEqual(
      smallImages.map((item) => item.buffer),
    )
  })

  test('forwards current and history images and extracts Lyria audio', async () => {
    mockGenerateText.mockResolvedValue({
      files: [],
      providerMetadata: { google: { interactionId: 'interaction-3' } },
      response: {
        body: {
          id: 'interaction-3',
          model: LYRIA_3_CLIP_MODEL,
          outputs: [
            { type: 'text', text: '[Verse]\nHello' },
            {
              type: 'audio',
              mime_type: 'audio/mpeg',
              data: Buffer.from('generated-music').toString('base64'),
            },
          ],
        },
      },
      text: '',
    })

    const result = await generateLyriaMusic({
      prompt: ' Cheerful synth pop ',
      model: LYRIA_3_CLIP_MODEL,
      media: [
        {
          buffer: Buffer.from('current-image'),
          mimeType: 'image/png',
          mediaType: 'image',
          origin: 'request',
        },
        {
          buffer: Buffer.from('history-image'),
          mimeType: 'image/jpeg',
          mediaType: 'image',
          origin: 'history',
        },
        {
          buffer: Buffer.from('reply-audio'),
          mimeType: 'audio/mpeg',
          mediaType: 'audio',
          origin: 'request',
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
    })
    expect(result).toEqual({
      buffer: Buffer.from('generated-music'),
      mimeType: 'audio/mpeg',
      interactionId: 'interaction-3',
      text: '[Verse]\nHello',
    })
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
