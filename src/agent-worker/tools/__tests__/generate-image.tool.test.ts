import type { Message } from 'grammy/types'

import type { MediaBuffer } from '@tg-bot/common'
import * as imageService from '../../services/image-generation'
import { getCollectedResponses, runWithToolContext } from '../context'
import { generateImageTool } from '../generate-image.tool'

const message = { chat: { id: 123 }, message_id: 55 } as Message

function image(
  label: string,
  data: string,
  origin: NonNullable<MediaBuffer['origin']> = 'request',
): MediaBuffer {
  return {
    buffer: Buffer.from(data),
    mimeType: 'image/jpeg',
    mediaType: 'image',
    label,
    origin,
  }
}

describe('generateImageTool', () => {
  beforeEach(() => {
    jest
      .spyOn(imageService, 'generateAgentImage')
      .mockResolvedValue(Buffer.from('out'))
  })

  afterEach(() => jest.restoreAllMocks())

  test('uses direct reply/current media before history media for edits', async () => {
    await runWithToolContext(
      message,
      [
        image('Reply message image (message_id=41)', 'reply-image'),
        image(
          'Context image from recent chat history: old screenshot',
          'history-image',
          'history',
        ),
      ],
      () => generateImageTool.execute({ prompt: 'make it brighter' }),
    )

    expect(imageService.generateAgentImage).toHaveBeenCalledWith(
      expect.stringContaining('Reply message image (message_id=41)'),
      [Buffer.from('reply-image')],
      undefined,
    )
  })

  test('does not use history images by default when there is no direct media', async () => {
    await runWithToolContext(
      message,
      [
        image(
          'Context image from recent chat history: older image',
          'older-history',
          'history',
        ),
        image(
          'Context image from recent chat history: newest image',
          'newest-history',
          'history',
        ),
      ],
      () =>
        generateImageTool.execute({
          prompt: 'turn the last photo into a poster',
        }),
    )

    expect(imageService.generateAgentImage).toHaveBeenCalledWith(
      'turn the last photo into a poster',
      undefined,
      undefined,
    )
  })

  test('uses newest history image only when explicitly requested', async () => {
    await runWithToolContext(
      message,
      [
        image(
          'Context image from recent chat history: older image',
          'older-history',
          'history',
        ),
        image(
          'Context image from recent chat history: newest image',
          'newest-history',
          'history',
        ),
      ],
      () =>
        generateImageTool.execute({
          prompt: 'turn the last photo into a poster',
          mediaIds: [2],
        }),
    )

    expect(imageService.generateAgentImage).toHaveBeenCalledWith(
      expect.stringContaining('newest image'),
      [Buffer.from('newest-history')],
      undefined,
    )
  })

  test.each([undefined, 'e', 'ee', 'gp', 'de', 'ge'])(
    'passes command %s to the image service and collects its result',
    async (command) => {
      const responses = await runWithToolContext(
        message,
        undefined,
        async () => {
          await generateImageTool.execute({ prompt: 'draw a fox' })
          return getCollectedResponses()
        },
        undefined,
        command,
      )

      expect(imageService.generateAgentImage).toHaveBeenCalledWith(
        'draw a fox',
        undefined,
        command,
      )
      expect(responses).toEqual([{ type: 'image', buffer: Buffer.from('out') }])
    },
  )
})
