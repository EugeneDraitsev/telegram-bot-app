import type { Message } from 'grammy/types'

import type { MediaBuffer } from '@tg-bot/common'

const mockGenerateVeoVideo = jest.fn()
const mockGenerateLyriaMusic = jest.fn()
const mockPrepareVeoMedia = jest.fn(
  (media: MediaBuffer[] | undefined, _explicit: boolean) => media ?? [],
)
const mockPrepareLyriaMedia = jest.fn(
  (media: MediaBuffer[] | undefined, _explicit: boolean) => media ?? [],
)

jest.mock('../../services/google-media', () => ({
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS: 170_000,
  LYRIA_3_CLIP_MODEL: 'lyria-3-clip-preview',
  LYRIA_3_PRO_MODEL: 'lyria-3-pro-preview',
  VEO_3_1_LITE_MODEL: 'veo-3.1-lite-generate-preview',
  generateVeoVideo: (...args: unknown[]) => mockGenerateVeoVideo(...args),
  generateLyriaMusic: (...args: unknown[]) => mockGenerateLyriaMusic(...args),
  prepareVeoMedia: (media: MediaBuffer[] | undefined, explicit: boolean) =>
    mockPrepareVeoMedia(media, explicit),
  prepareLyriaMedia: (media: MediaBuffer[] | undefined, explicit: boolean) =>
    mockPrepareLyriaMedia(media, explicit),
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
    mockGenerateVeoVideo.mockReset()
    mockGenerateVeoVideo.mockResolvedValue({
      buffer: Buffer.from('video'),
      mimeType: 'video/mp4',
    })
    mockGenerateLyriaMusic.mockReset()
    mockGenerateLyriaMusic.mockResolvedValue({
      buffer: Buffer.from('music'),
      mimeType: 'audio/mpeg',
      text: '[Verse]\nhello',
    })
    mockPrepareVeoMedia.mockClear()
    mockPrepareVeoMedia.mockImplementation((media) => media ?? [])
    mockPrepareLyriaMedia.mockClear()
    mockPrepareLyriaMedia.mockImplementation((media) => media ?? [])
  })

  test('uses the Google media tool timeout', () => {
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
          durationSeconds: 5,
        })
        return getCollectedResponses()
      },
    )

    expect(mockGenerateVeoVideo).toHaveBeenCalledWith({
      prompt: 'Neon fox',
      durationSeconds: 6,
      aspectRatio: '9:16',
      media: [requestImage],
    })
    expect(mockPrepareVeoMedia).toHaveBeenCalledWith([requestImage], false)
    expect(responses).toEqual([
      expect.objectContaining({
        type: 'video',
        buffer: Buffer.from('video'),
        fileName: 'veo-lite-video.mp4',
        caption: 'Неоновая лиса мчится сквозь снежную ночь.',
      }),
    ])
  })

  test('keeps Pro restricted to the explicit /lyriapro command', async () => {
    const responses = await runWithToolContext(
      message,
      [requestImage, historyImage],
      async () => {
        await generateMusicTool.execute({
          prompt: 'A full synth-pop song',
          title: 'Город после полуночи',
          caption: 'Меланхоличный синти-поп о ночном городе.',
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
    })
    expect(responses).toEqual([
      expect.objectContaining({
        type: 'audio',
        buffer: Buffer.from('music'),
        fileName: 'lyria-song.mp3',
        title: 'Город после полуночи',
        caption: 'Меланхоличный синти-поп о ночном городе.',
        delivery: 'audio',
      }),
      { type: 'text', text: '[Verse]\nhello' },
    ])
  })

  test('always uses the 30-second Clip model for agentic requests', async () => {
    const responses = await runWithToolContext(message, [], async () => {
      await generateMusicTool.execute({
        prompt: 'A full-length multi-section synth-pop song',
        title: 'Neon Night',
        caption: 'A sweeping synth-pop track.',
        mode: 'pro',
      })
      return getCollectedResponses()
    })

    expect(mockGenerateLyriaMusic).toHaveBeenCalledWith({
      prompt: 'A full-length multi-section synth-pop song',
      model: 'lyria-3-clip-preview',
      media: [],
    })
    expect(responses).toEqual([
      expect.objectContaining({
        type: 'audio',
        fileName: 'lyria-clip.mp3',
        delivery: 'voice',
      }),
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

    expect(mockGenerateVeoVideo).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 6, media: [historyImage] }),
    )
    expect(mockPrepareVeoMedia).toHaveBeenCalledWith([historyImage], true)
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
      expect.objectContaining({
        title: undefined,
        caption: undefined,
        delivery: 'voice',
      }),
    )
  })

  test('rejects a second generated media tool while the first is running', async () => {
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
      ).rejects.toThrow(
        'Only one generated media result can be created per request',
      )
      await videoPromise
    })

    expect(mockGenerateVeoVideo).toHaveBeenCalledTimes(1)
    expect(mockGenerateLyriaMusic).not.toHaveBeenCalled()
  })

  test('does not start another generated media tool after a failure', async () => {
    mockGenerateVeoVideo.mockRejectedValueOnce(new Error('Veo failed'))

    await runWithToolContext(message, [], async () => {
      await expect(
        generateVideoTool.execute({ prompt: 'Failing video' }),
      ).rejects.toThrow('Veo failed')
      await expect(
        generateMusicTool.execute({ prompt: 'Try music instead' }),
      ).rejects.toThrow(
        'Only one generated media result can be created per request',
      )
    })

    expect(mockGenerateVeoVideo).toHaveBeenCalledTimes(1)
    expect(mockGenerateLyriaMusic).not.toHaveBeenCalled()
  })

  test('rejects invalid selected media before claiming the result slot', async () => {
    mockPrepareVeoMedia.mockImplementationOnce(() => {
      throw new Error(
        'Veo 3.1 Lite selected media exceeds the 14 MiB raw inline limit',
      )
    })

    await runWithToolContext(message, [requestImage], async () => {
      await expect(
        generateVideoTool.execute({
          prompt: 'Animate this',
          caption: 'Animation',
          mediaIds: [1],
        }),
      ).rejects.toThrow('selected media exceeds the 14 MiB raw inline limit')

      await expect(
        generateMusicTool.execute({
          prompt: 'Soundtrack',
          title: 'Afterward',
          caption: 'A soundtrack',
          mediaIds: [],
        }),
      ).resolves.toBe('Generated track: Afterward')
    })

    expect(mockGenerateVeoVideo).not.toHaveBeenCalled()
    expect(mockGenerateLyriaMusic).toHaveBeenCalledTimes(1)
  })
})
