import type { Message } from 'grammy/types'

import type { MediaBuffer } from '@tg-bot/common'

const mockGenerateOmniVideo = jest.fn()
const mockGenerateLyriaMusic = jest.fn()
const mockValidateOmniMedia = jest.fn(
  (media: MediaBuffer[] | undefined) => media ?? [],
)
const mockValidateLyriaMedia = jest.fn(
  (media: MediaBuffer[] | undefined) => media ?? [],
)

jest.mock('../../services/google-media', () => ({
  GEMINI_OMNI_FLASH_MODEL: 'gemini-omni-flash-preview',
  GOOGLE_MEDIA_MIN_REQUEST_TIMEOUT_MS: 60_000,
  GOOGLE_MEDIA_REQUEST_TIMEOUT_MS: 160_000,
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS: 170_000,
  LYRIA_3_CLIP_MODEL: 'lyria-3-clip-preview',
  LYRIA_3_PRO_MODEL: 'lyria-3-pro-preview',
  generateOmniVideo: (...args: unknown[]) => mockGenerateOmniVideo(...args),
  generateLyriaMusic: (...args: unknown[]) => mockGenerateLyriaMusic(...args),
  validateOmniMedia: (media: MediaBuffer[] | undefined) =>
    mockValidateOmniMedia(media),
  validateLyriaMedia: (media: MediaBuffer[] | undefined) =>
    mockValidateLyriaMedia(media),
}))

import { getCollectedResponses, runWithToolContext } from '../context'
import { generateMusicTool } from '../lyria-music.tool'
import { generateVideoTool } from '../omni-video.tool'

const message = {
  chat: { id: 123 },
  message_id: 55,
} as Message

const requestImage: MediaBuffer = {
  buffer: Buffer.from('image'),
  mimeType: 'image/jpeg',
  mediaType: 'image',
}

const historyImage: MediaBuffer = {
  buffer: Buffer.from('history-image'),
  mimeType: 'image/jpeg',
  mediaType: 'image',
  origin: 'history',
}

describe('Google media agent tools', () => {
  beforeEach(() => {
    mockGenerateOmniVideo.mockReset()
    mockGenerateOmniVideo.mockResolvedValue({
      buffer: Buffer.from('video'),
      mimeType: 'video/mp4',
    })
    mockGenerateLyriaMusic.mockReset()
    mockGenerateLyriaMusic.mockResolvedValue({
      buffer: Buffer.from('music'),
      mimeType: 'audio/mpeg',
      text: '[Verse]\nhello',
    })
    mockValidateOmniMedia.mockClear()
    mockValidateOmniMedia.mockImplementation((media) => media ?? [])
    mockValidateLyriaMedia.mockClear()
    mockValidateLyriaMedia.mockImplementation((media) => media ?? [])
  })

  test('reserves Lambda time for routing and Telegram delivery', () => {
    expect(generateVideoTool.timeoutMs).toBe(170_000)
    expect(generateMusicTool.timeoutMs).toBe(170_000)
  })

  test('uses current media but not history media by default', async () => {
    const responses = await runWithToolContext(
      message,
      [requestImage, historyImage],
      async () => {
        await generateVideoTool.execute({
          prompt: 'Neon fox',
          caption: 'Неоновая лиса мчится сквозь снежную ночь.',
          durationSeconds: 1,
        })
        return getCollectedResponses()
      },
    )

    expect(mockGenerateOmniVideo).toHaveBeenCalledWith({
      prompt: 'Neon fox',
      durationSeconds: 3,
      aspectRatio: '9:16',
      media: [requestImage],
      timeoutMs: 160_000,
    })
    expect(responses).toEqual([
      expect.objectContaining({
        type: 'video',
        buffer: Buffer.from('video'),
        fileName: 'omni-video.mp4',
        caption: 'Неоновая лиса мчится сквозь снежную ночь.',
      }),
    ])
  })

  test('/lyriapro overrides a conflicting clip argument and can include lyrics', async () => {
    const responses = await runWithToolContext(
      message,
      [requestImage, historyImage],
      async () => {
        await generateMusicTool.execute({
          prompt: 'A full synth-pop song',
          title: 'Город после полуночи',
          caption: 'Меланхоличный синти-поп о ночном городе.',
          mode: 'clip',
          includeLyrics: true,
        })
        return getCollectedResponses()
      },
      undefined,
      'lyriapro',
    )

    expect(mockGenerateLyriaMusic).toHaveBeenCalledWith({
      prompt: 'A full synth-pop song',
      model: 'lyria-3-pro-preview',
      media: [requestImage],
      timeoutMs: 160_000,
    })
    expect(responses).toEqual([
      expect.objectContaining({
        type: 'audio',
        buffer: Buffer.from('music'),
        fileName: 'lyria-song.mp3',
        title: 'Город после полуночи',
        caption: 'Меланхоличный синти-поп о ночном городе.',
      }),
      { type: 'text', text: '[Verse]\nhello' },
    ])
  })

  test('uses exact history media only when the model selects its media_id', async () => {
    await runWithToolContext(message, [requestImage, historyImage], () =>
      generateVideoTool.execute({
        prompt: 'Animate the older photo',
        caption: 'Старая фотография оживает.',
        mediaIds: [2],
      }),
    )

    expect(mockGenerateOmniVideo).toHaveBeenCalledWith(
      expect.objectContaining({ media: [historyImage] }),
    )
  })

  test('does not expose technical prompts as missing metadata', async () => {
    const videoResponses = await runWithToolContext(message, [], async () => {
      await generateVideoTool.execute({ prompt: 'technical video prompt' })
      return getCollectedResponses()
    })
    const musicResponses = await runWithToolContext(message, [], async () => {
      await generateMusicTool.execute({ prompt: 'technical music prompt' })
      return getCollectedResponses()
    })

    expect(videoResponses[0]).toEqual(
      expect.objectContaining({ caption: undefined }),
    )
    expect(musicResponses[0]).toEqual(
      expect.objectContaining({ title: undefined, caption: undefined }),
    )
  })

  test('rejects a second paid media tool while the first is running', async () => {
    await runWithToolContext(message, [], async () => {
      const videoPromise = generateVideoTool.execute({
        prompt: 'Neon fox',
        caption: 'A running fox',
      })

      await expect(
        generateMusicTool.execute({
          prompt: 'Neon fox soundtrack',
          title: 'Night Run',
          caption: 'A fast synth track',
        }),
      ).rejects.toThrow('A paid media generation was already attempted')
      await videoPromise
    })

    expect(mockGenerateOmniVideo).toHaveBeenCalledTimes(1)
    expect(mockGenerateLyriaMusic).not.toHaveBeenCalled()
  })

  test('does not start another paid media generation after a failure', async () => {
    mockGenerateOmniVideo.mockRejectedValueOnce(new Error('Omni failed'))

    await runWithToolContext(message, [], async () => {
      await expect(
        generateVideoTool.execute({ prompt: 'Failing video' }),
      ).rejects.toThrow('Omni failed')
      await expect(
        generateMusicTool.execute({ prompt: 'Try music instead' }),
      ).rejects.toThrow('A paid media generation was already attempted')
    })

    expect(mockGenerateOmniVideo).toHaveBeenCalledTimes(1)
    expect(mockGenerateLyriaMusic).not.toHaveBeenCalled()
  })

  test('does not start billed generation without a delivery time reserve', async () => {
    const result = runWithToolContext(
      message,
      [],
      () =>
        generateVideoTool.execute({
          prompt: 'Neon fox',
          caption: 'A running fox',
        }),
      undefined,
      undefined,
      () => 79_999,
    )

    await expect(result).rejects.toThrow('Not enough execution time remains')
    expect(mockGenerateOmniVideo).not.toHaveBeenCalled()
  })

  test('shrinks the provider timeout to the current Lambda budget', async () => {
    await runWithToolContext(
      message,
      [],
      () =>
        generateVideoTool.execute({
          prompt: 'Neon fox',
          caption: 'A running fox',
        }),
      undefined,
      undefined,
      () => 140_000,
    )

    expect(mockGenerateOmniVideo).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 120_000 }),
    )
  })

  test('rejects invalid selected media before claiming paid generation', async () => {
    mockValidateOmniMedia.mockImplementationOnce(() => {
      throw new Error('Gemini Omni selected media exceeds the 19 MiB limit')
    })

    await runWithToolContext(message, [requestImage], async () => {
      await expect(
        generateVideoTool.execute({
          prompt: 'Animate this',
          caption: 'Animation',
          mediaIds: [1],
        }),
      ).rejects.toThrow('selected media exceeds the 19 MiB limit')

      await expect(
        generateMusicTool.execute({
          prompt: 'Soundtrack',
          title: 'Afterward',
          caption: 'A soundtrack',
          mediaIds: [],
        }),
      ).resolves.toBe('Generated track: Afterward')
    })

    expect(mockGenerateOmniVideo).not.toHaveBeenCalled()
    expect(mockGenerateLyriaMusic).toHaveBeenCalledTimes(1)
  })
})
