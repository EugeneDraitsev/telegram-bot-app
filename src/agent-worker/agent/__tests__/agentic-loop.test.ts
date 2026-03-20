import type { Message } from 'telegram-typings'

import { resolveHistoryMediaAttachments } from '@tg-bot/common'
import type { TelegramApi } from '../../types'

describe('resolveHistoryMediaAttachments', () => {
  const originalFetch = global.fetch
  const originalToken = process.env.TOKEN

  afterEach(() => {
    global.fetch = originalFetch
    process.env.TOKEN = originalToken
  })

  test('keeps message mapping when one history image download is skipped', async () => {
    process.env.TOKEN = 'test-token'

    const recentMessageA = {
      message_id: 11,
      text: 'first context message',
    } as unknown as Message
    const recentMessageB = {
      message_id: 12,
      text: 'second context message',
    } as unknown as Message

    const api = {
      getFile: jest.fn(async (fileId: string) => ({
        file_path: `${fileId}.jpg`,
      })),
    } as unknown as TelegramApi

    global.fetch = jest.fn(async (url: string | URL | Request) => {
      const href = String(url)
      if (href.includes('missing-image.jpg')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          arrayBuffer: async () => new ArrayBuffer(0),
        } as Response
      }

      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
      } as Response
    }) as typeof fetch

    const resolved = await resolveHistoryMediaAttachments(
      [
        {
          ref: {
            fileId: 'missing-image',
            mimeType: 'image/jpeg',
            mediaType: 'image',
          },
          message: recentMessageA,
        },
        {
          ref: {
            fileId: 'available-image',
            mimeType: 'image/jpeg',
            mediaType: 'image',
          },
          message: recentMessageB,
        },
      ],
      api,
    )

    expect(resolved).toHaveLength(1)
    expect(resolved[0]?.message).toBe(recentMessageB)
    expect(resolved[0]?.media.buffer.equals(Buffer.from([1, 2, 3]))).toBe(true)
  })
})
