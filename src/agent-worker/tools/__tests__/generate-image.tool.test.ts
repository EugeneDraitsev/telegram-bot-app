import type { Message } from 'telegram-typings'

import type { MediaBuffer } from '@tg-bot/common'

const mockGenerateImageOpenAi = jest.fn()

jest.mock('../../services', () => ({
  generateImageOpenAi: (...args: unknown[]) => mockGenerateImageOpenAi(...args),
}))

import { runWithToolContext } from '../context'
import { generateImageTool } from '../generate-image.tool'

const message = {
  chat: { id: 123 },
  message_id: 55,
} as Message

function image(label: string, data: string): MediaBuffer {
  return {
    buffer: Buffer.from(data),
    mimeType: 'image/jpeg',
    mediaType: 'image',
    label,
  }
}

describe('generateImageTool', () => {
  beforeEach(() => {
    mockGenerateImageOpenAi.mockReset()
    mockGenerateImageOpenAi.mockResolvedValue({ image: Buffer.from('out') })
  })

  test('uses direct reply/current media before history media for edits', async () => {
    await runWithToolContext(
      message,
      [
        image('Reply message image (message_id=41)', 'reply-image'),
        image(
          'Context image from recent chat history. Related message text: old screenshot',
          'history-image',
        ),
      ],
      async () => {
        await generateImageTool.execute({
          prompt: 'make it brighter',
          useAttachedImage: true,
        })
      },
    )

    expect(mockGenerateImageOpenAi).toHaveBeenCalledWith(
      expect.stringContaining('Reply message image (message_id=41)'),
      [Buffer.from('reply-image')],
    )
    expect(mockGenerateImageOpenAi.mock.calls[0]?.[0]).not.toContain(
      'old screenshot',
    )
  })

  test('does not use history images by default when there is no direct media', async () => {
    await runWithToolContext(
      message,
      [
        image(
          'Context image from recent chat history. Related message text: older image',
          'older-history',
        ),
        image(
          'Context image from recent chat history. Related message text: newest image',
          'newest-history',
        ),
      ],
      async () => {
        await generateImageTool.execute({
          prompt: 'turn the last photo into a poster',
          useAttachedImage: true,
        })
      },
    )

    expect(mockGenerateImageOpenAi).toHaveBeenCalledWith(
      expect.not.stringContaining('newest image'),
      undefined,
    )
    expect(mockGenerateImageOpenAi.mock.calls[0]?.[0]).not.toContain(
      'older image',
    )
  })

  test('uses newest history image only when explicitly requested', async () => {
    await runWithToolContext(
      message,
      [
        image(
          'Context image from recent chat history. Related message text: older image',
          'older-history',
        ),
        image(
          'Context image from recent chat history. Related message text: newest image',
          'newest-history',
        ),
      ],
      async () => {
        await generateImageTool.execute({
          prompt: 'turn the last photo into a poster',
          mediaSource: 'history',
        })
      },
    )

    expect(mockGenerateImageOpenAi).toHaveBeenCalledWith(
      expect.stringContaining('newest image'),
      [Buffer.from('newest-history')],
    )
    expect(mockGenerateImageOpenAi.mock.calls[0]?.[0]).not.toContain(
      'older image',
    )
  })
})
