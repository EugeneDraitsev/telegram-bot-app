import type { Message } from 'grammy/types'

import type { MediaBuffer } from '@tg-bot/common'
import {
  claimPaidMediaGeneration,
  requireToolContext,
  runWithToolContext,
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
  test('allows only one paid media generation attempt per context', async () => {
    await runWithToolContext(message, undefined, async () => {
      claimPaidMediaGeneration()
      expect(() => claimPaidMediaGeneration()).toThrow(
        'A paid media generation was already attempted',
      )
    })

    await runWithToolContext(message, undefined, async () => {
      expect(() => claimPaidMediaGeneration()).not.toThrow()
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
})
