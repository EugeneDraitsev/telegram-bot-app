import type { Message } from 'grammy/types'

import * as imageService from '../../services/image-generation'
import { getCollectedResponses, runWithToolContext } from '../context'
import { generateGifTool } from '../generate-gif.tool'

const message = { chat: { id: 123 }, message_id: 55 } as Message

describe('generateGifTool', () => {
  beforeEach(() => {
    jest
      .spyOn(imageService, 'generateAgentGif')
      .mockResolvedValue(Buffer.from('GIF89a'))
  })

  afterEach(() => jest.restoreAllMocks())

  test('queues the generated GIF as an animation upload', async () => {
    const responses = await runWithToolContext(
      message,
      undefined,
      async () => {
        await generateGifTool.execute({ prompt: ' a cat waving ' })
        return getCollectedResponses()
      },
      undefined,
      'gif',
    )

    expect(imageService.generateAgentGif).toHaveBeenCalledWith(
      'a cat waving',
      'gif',
    )
    expect(responses).toEqual([
      { type: 'animation', buffer: Buffer.from('GIF89a') },
    ])
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
