import type { Message } from 'grammy/types'

import type { MediaBuffer } from '@tg-bot/common'
import { logger } from '@tg-bot/common'
import {
  claimGeneratedMedia,
  queueModelInspectionImages,
  registerToolMediaBuffers,
  requireToolContext,
  runWithToolCallContext,
  runWithToolContext,
  takePendingModelInspectionImages,
  trackToolModelCall,
  withToolMediaBuffers,
} from '../context'

const message = {
  chat: { id: 123 },
  message_id: 55,
} as Message

function image(label: string): MediaBuffer {
  return {
    buffer: Buffer.from(label),
    mimeType: 'image/jpeg',
    mediaType: 'image',
    label,
  }
}

describe('tool context', () => {
  test('keeps model-call logs isolated for parallel tools and their fallbacks', async () => {
    const log = jest.spyOn(logger, 'info').mockImplementation(() => {})
    try {
      await runWithToolContext(message, undefined, () =>
        Promise.all(
          ['first', 'second'].map((tool) =>
            runWithToolCallContext(
              { tool, toolCallId: `${tool}-id`, callerModel: 'caller' },
              async () => {
                await Promise.resolve()
                await trackToolModelCall(
                  { name: tool, model: `${tool}-primary` },
                  async () => 'primary',
                )
                await trackToolModelCall(
                  {
                    name: tool,
                    model: `${tool}-fallback`,
                    fallbackFrom: `${tool}-primary`,
                  },
                  async () => 'fallback',
                )
              },
            ),
          ),
        ),
      )
      for (const tool of ['first', 'second']) {
        expect(log).toHaveBeenCalledWith(
          expect.objectContaining({
            chatId: 123,
            messageId: 55,
            tool,
            toolCallId: `${tool}-id`,
            callerModel: 'caller',
            model: `${tool}-fallback`,
            fallbackFrom: `${tool}-primary`,
          }),
          'tool.model_call',
        )
      }
    } finally {
      log.mockRestore()
    }
  })

  test('allows only one generated media result per context', async () => {
    await runWithToolContext(message, undefined, async () => {
      claimGeneratedMedia()
      expect(() => claimGeneratedMedia()).toThrow(
        'Only one generated media result can be created per request',
      )
    })

    await runWithToolContext(message, undefined, async () => {
      expect(() => claimGeneratedMedia()).not.toThrow()
    })
  })

  test('scopes media buffer override and restores the previous context', async () => {
    const initialMedia = [image('initial')]
    const scopedMedia = [image('scoped')]

    await runWithToolContext(message, initialMedia, async () => {
      expect(requireToolContext().mediaBuffers).toBe(initialMedia)

      await withToolMediaBuffers(scopedMedia, async () => {
        expect(requireToolContext().mediaBuffers).toBe(scopedMedia)
      })

      expect(requireToolContext().mediaBuffers).toBe(initialMedia)
    })
  })

  test('registers lazily loaded media with stable deduplicated ids', async () => {
    const initial = {
      ...image('initial'),
      fileId: 'telegram-file-1',
      fileUniqueId: 'telegram-unique-1',
    }
    const duplicate = {
      ...image('duplicate download'),
      fileId: 'telegram-file-2',
      fileUniqueId: 'telegram-unique-1',
    }
    const loaded = {
      ...image('loaded'),
      fileId: 'telegram-file-3',
      fileUniqueId: 'telegram-unique-3',
    }

    await runWithToolContext(message, [initial], async () => {
      expect(registerToolMediaBuffers([duplicate, loaded])).toEqual([
        { media: initial, mediaId: 1 },
        { media: loaded, mediaId: 2 },
      ])
      expect(requireToolContext().mediaBuffers).toEqual([initial, loaded])
    })
  })

  test('does not queue current media again after a historical download deduplicates to it', async () => {
    const current = {
      ...image('current'),
      origin: 'request' as const,
      fileUniqueId: 'same-image',
    }
    const historicalDownload = {
      ...image('historical download'),
      origin: 'history' as const,
      fileUniqueId: 'same-image',
    }

    await runWithToolContext(message, [current], async () => {
      const registered = registerToolMediaBuffers([historicalDownload])

      expect(registered).toEqual([{ media: current, mediaId: 1 }])
      expect(queueModelInspectionImages(registered)).toEqual(new Set())
      expect(takePendingModelInspectionImages()).toEqual([])
    })
  })
})
