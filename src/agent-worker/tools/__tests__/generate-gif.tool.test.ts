import type { Message } from 'grammy/types'

import * as imageService from '../../services/image-generation'
import { getCollectedResponses, runWithToolContext } from '../context'
import { generateGifTool } from '../generate-gif.tool'

const message = { chat: { id: 123 }, message_id: 55 } as Message

describe('generateGifTool', () => {
  beforeEach(() => {
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

    expect(imageService.generateAgentGif).toHaveBeenCalledWith('a cat waving', {
      frameCount: 24,
      frameDurationMs: 80,
    })
    expect(result).toContain('24 frames at 12.5 fps')
    expect(responses).toEqual([
      { type: 'animation', buffer: Buffer.from('GIF89a') },
    ])
  })

  test('passes requested frame timing within the API limits', async () => {
    const result = await runWithToolContext(message, undefined, () =>
      generateGifTool.execute({
        prompt: 'a cat waving',
        frameCount: 48,
        frameDurationMs: 42,
      }),
    )

    expect(imageService.generateAgentGif).toHaveBeenCalledWith('a cat waving', {
      frameCount: 48,
      frameDurationMs: 40,
    })
    expect(result).toContain('48 frames at 25 fps')
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
