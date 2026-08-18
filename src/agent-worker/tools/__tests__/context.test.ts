import type { Message } from 'grammy/types'

import {
  type MediaBuffer,
  setPaidMediaCooldownRedisClientForTests,
} from '@tg-bot/common'
import {
  claimPaidMediaGeneration,
  preparePaidMediaGeneration,
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
        'Only one generated media result can be created per request',
      )
    })

    await runWithToolContext(message, undefined, async () => {
      expect(() => claimPaidMediaGeneration()).not.toThrow()
    })
  })

  test('shrinks provider timeout to preserve Telegram delivery time', async () => {
    await runWithToolContext(
      message,
      undefined,
      async () => {
        await expect(
          preparePaidMediaGeneration({
            maximumRequestTimeoutMs: 160_000,
            minimumRequestTimeoutMs: 60_000,
          }),
        ).resolves.toBe(120_000)
      },
      undefined,
      undefined,
      () => 140_000,
    )
  })

  test('uses the maximum provider timeout outside Lambda', async () => {
    await runWithToolContext(message, undefined, async () => {
      await expect(
        preparePaidMediaGeneration({
          maximumRequestTimeoutMs: 160_000,
          minimumRequestTimeoutMs: 60_000,
        }),
      ).resolves.toBe(160_000)
    })
  })

  test('rejects paid generation only when the usable provider time is low', async () => {
    await runWithToolContext(
      message,
      undefined,
      async () => {
        await expect(
          preparePaidMediaGeneration({
            maximumRequestTimeoutMs: 160_000,
            minimumRequestTimeoutMs: 60_000,
          }),
        ).rejects.toThrow('Not enough execution time remains')
      },
      undefined,
      undefined,
      () => 79_999,
    )
  })

  test('releases the request slot when the user cooldown refuses a start', async () => {
    const originalIsOffline = process.env.IS_OFFLINE
    process.env.IS_OFFLINE = 'false'
    const set = jest.fn().mockResolvedValue(null)
    setPaidMediaCooldownRedisClientForTests({
      set,
    } as unknown as Parameters<
      typeof setPaidMediaCooldownRedisClientForTests
    >[0])

    try {
      await runWithToolContext(message, undefined, async () => {
        await expect(
          preparePaidMediaGeneration({
            maximumRequestTimeoutMs: 160_000,
            minimumRequestTimeoutMs: 60_000,
          }),
        ).rejects.toThrow('limited to once every 60 seconds')
        expect(() => claimPaidMediaGeneration()).not.toThrow()
      })
    } finally {
      setPaidMediaCooldownRedisClientForTests(undefined)
      if (originalIsOffline === undefined) delete process.env.IS_OFFLINE
      else process.env.IS_OFFLINE = originalIsOffline
    }
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
