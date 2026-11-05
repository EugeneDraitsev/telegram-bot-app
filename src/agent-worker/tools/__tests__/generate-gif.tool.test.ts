import type { Message } from 'grammy/types'

import type { MediaBuffer } from '@tg-bot/common'
import * as common from '@tg-bot/common'
import * as imageService from '../../services/image-generation'
import { getCollectedResponses, runWithToolContext } from '../context'
import { generateGifTool } from '../generate-gif.tool'

const message = { chat: { id: 123 }, message_id: 55 } as Message

describe('generateGifTool', () => {
  beforeEach(() => {
    jest
      .spyOn(common, 'extractTelegramVideoFrames')
      .mockResolvedValue([Buffer.from('first'), Buffer.from('last')])
    jest
      .spyOn(imageService, 'generateAgentGif')
      .mockImplementation(async (_prompt, timing) => ({
        gif: Buffer.from('GIF89a'),
        timing,
      }))
  })

  afterEach(() => jest.restoreAllMocks())

  test('queues the generated GIF as an animation upload', async () => {
    const [result, responses] = await runWithToolContext(
      message,
      undefined,
      async () => [
        await generateGifTool.execute({ prompt: ' a cat waving ' }),
        getCollectedResponses(),
      ],
      undefined,
      'gif',
    )

    expect(imageService.generateAgentGif).toHaveBeenCalledWith(
      'a cat waving',
      { frameCount: 16, frameDurationMs: 80 },
      undefined,
    )
    expect(result).toContain('16 frames at 12.5 fps')
    expect(responses).toEqual([
      { type: 'animation', buffer: Buffer.from('GIF89a') },
    ])
  })

  test('clamps requested frame timing to the API limits', async () => {
    const result = await runWithToolContext(message, undefined, () =>
      generateGifTool.execute({
        prompt: 'a cat waving',
        frameCount: 48,
        frameDurationMs: 42,
      }),
    )

    expect(imageService.generateAgentGif).toHaveBeenCalledWith(
      'a cat waving',
      { frameCount: 16, frameDurationMs: 40 },
      undefined,
    )
    expect(result).toContain('16 frames at 25 fps')
  })

  test('reports the timing the API actually used', async () => {
    jest.spyOn(imageService, 'generateAgentGif').mockResolvedValueOnce({
      gif: Buffer.from('GIF89a'),
      timing: { frameCount: 9, frameDurationMs: 200 },
    })
    const result = await runWithToolContext(message, undefined, () =>
      generateGifTool.execute({ prompt: 'a cat waving' }),
    )

    expect(result).toContain('9 frames at 5 fps')
  })

  const image: MediaBuffer = {
    buffer: Buffer.from('photo'),
    mimeType: 'image/png',
    mediaType: 'image',
    origin: 'request',
  }

  test('edits selected images and excludes unselected history', async () => {
    const history: MediaBuffer = { ...image, origin: 'history' }
    const result = await runWithToolContext(message, [image, history], () =>
      generateGifTool.execute({ prompt: 'make it blue' }),
    )

    expect(imageService.generateAgentGif).toHaveBeenCalledWith(
      'make it blue',
      { frameCount: 16, frameDurationMs: 80 },
      [image],
    )
    expect(common.extractTelegramVideoFrames).not.toHaveBeenCalled()
    expect(result).toContain('Successfully edited GIF')
  })

  test('uses only the exact selected historical source', async () => {
    const history: MediaBuffer = { ...image, origin: 'history' }
    await runWithToolContext(message, [image, history], () =>
      generateGifTool.execute({ prompt: 'make it blue', mediaIds: [2] }),
    )

    expect(imageService.generateAgentGif).toHaveBeenCalledWith(
      'make it blue',
      expect.anything(),
      [history],
    )
  })

  test('allows text-only creation when a reply has media', async () => {
    await runWithToolContext(message, [image], () =>
      generateGifTool.execute({ prompt: 'a new cat', mediaIds: [] }),
    )

    expect(imageService.generateAgentGif).toHaveBeenCalledWith(
      'a new cat',
      expect.anything(),
      undefined,
    )
    expect(common.extractTelegramVideoFrames).not.toHaveBeenCalled()
  })

  test.each(['video/mp4', 'image/gif'])(
    'rebuilds a selected %s animation from reference frames',
    async (mimeType) => {
      const animation: MediaBuffer = {
        buffer: Buffer.from('animation'),
        mimeType,
        mediaType: mimeType === 'image/gif' ? 'image' : 'video',
        fileId: 'telegram-animation',
      }
      const result = await runWithToolContext(message, [animation], () =>
        generateGifTool.execute({ prompt: 'make it blue', mediaIds: [1] }),
      )

      expect(common.extractTelegramVideoFrames).toHaveBeenCalledWith({
        fileId: 'telegram-animation',
        maxDurationSeconds: 10,
      })
      expect(imageService.generateAgentGif).toHaveBeenCalledWith(
        'make it blue',
        { frameCount: 16, frameDurationMs: 80 },
        [
          { buffer: Buffer.from('first'), mimeType: 'image/jpeg' },
          { buffer: Buffer.from('last'), mimeType: 'image/jpeg' },
        ],
      )
      expect(result).toContain('edited GIF from animation reference frames')
    },
  )

  test('does not generate an unrelated GIF when source extraction fails', async () => {
    jest
      .spyOn(common, 'extractTelegramVideoFrames')
      .mockRejectedValueOnce(new Error('source download failed'))
    const animation: MediaBuffer = {
      ...image,
      mimeType: 'video/mp4',
      mediaType: 'video',
      fileId: 'telegram-animation',
    }

    await expect(
      runWithToolContext(message, [animation], () =>
        generateGifTool.execute({ prompt: 'make it blue' }),
      ),
    ).rejects.toThrow('source download failed')
    expect(imageService.generateAgentGif).not.toHaveBeenCalled()
  })

  test('rejects multiple animations before starting extraction or generation', async () => {
    const animation: MediaBuffer = {
      ...image,
      mimeType: 'image/gif',
      fileId: 'gif',
    }
    await expect(
      runWithToolContext(message, [animation, animation], () =>
        generateGifTool.execute({ prompt: 'combine them' }),
      ),
    ).rejects.toThrow('Select only one GIF or video')
    expect(common.extractTelegramVideoFrames).not.toHaveBeenCalled()
    expect(imageService.generateAgentGif).not.toHaveBeenCalled()
  })

  test('rejects an animation without a Telegram source before generation', async () => {
    await expect(
      runWithToolContext(message, [{ ...image, mimeType: 'image/gif' }], () =>
        generateGifTool.execute({ prompt: 'edit it' }),
      ),
    ).rejects.toThrow('no Telegram file_id')
    expect(imageService.generateAgentGif).not.toHaveBeenCalled()
  })

  test('counts extracted animation frames against the reference limit', async () => {
    const animation: MediaBuffer = {
      ...image,
      mimeType: 'image/gif',
      fileId: 'gif',
    }
    await expect(
      runWithToolContext(message, [animation, ...Array(15).fill(image)], () =>
        generateGifTool.execute({ prompt: 'edit it' }),
      ),
    ).rejects.toThrow('at most 16 reference images')
    expect(common.extractTelegramVideoFrames).not.toHaveBeenCalled()
    expect(imageService.generateAgentGif).not.toHaveBeenCalled()
  })

  test('shares the one generated media slot per request', async () => {
    await expect(
      runWithToolContext(message, undefined, async () => {
        await generateGifTool.execute({ prompt: 'a cat waving' })
        await generateGifTool.execute({ prompt: 'a dog waving' })
      }),
    ).rejects.toThrow('Only one generated media result')
    expect(imageService.generateAgentGif).toHaveBeenCalledTimes(1)
  })

  test('rejects an empty prompt', async () => {
    await expect(
      runWithToolContext(message, undefined, () =>
        generateGifTool.execute({ prompt: '  ' }),
      ),
    ).rejects.toThrow('Prompt cannot be empty')
    expect(imageService.generateAgentGif).not.toHaveBeenCalled()
  })
})
