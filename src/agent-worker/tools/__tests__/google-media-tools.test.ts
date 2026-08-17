import type { Message } from 'grammy/types'

import type { MediaBuffer } from '@tg-bot/common'

const mockGenerateOmniVideo = jest.fn()
const mockGenerateLyriaMusic = jest.fn()

jest.mock('../../services/google-media', () => ({
  GEMINI_OMNI_FLASH_MODEL: 'gemini-omni-flash-preview',
  LYRIA_3_CLIP_MODEL: 'lyria-3-clip-preview',
  LYRIA_3_PRO_MODEL: 'lyria-3-pro-preview',
  generateOmniVideo: (...args: unknown[]) => mockGenerateOmniVideo(...args),
  generateLyriaMusic: (...args: unknown[]) => mockGenerateLyriaMusic(...args),
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
  origin: 'request',
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
  })

  test('reserves Lambda time for routing and Telegram delivery', () => {
    expect(generateVideoTool.timeoutMs).toBe(170_000)
    expect(generateMusicTool.timeoutMs).toBe(170_000)
  })

  test('forwards text and all media with cost-conscious Omni defaults', async () => {
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
      media: [requestImage, historyImage],
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
      media: [requestImage, historyImage],
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
})
