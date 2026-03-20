import type { Message } from 'telegram-typings'

import type { TelegramApi } from '../../types'
import {
  buildCurrentRequestPrompt,
  buildInitialContents,
  resolveHistoryMediaAttachments,
} from '../agentic-loop'

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

describe('buildCurrentRequestPrompt', () => {
  test('mentions attached history images when they are present', () => {
    const prompt = buildCurrentRequestPrompt('what is on those images?', 2)

    expect(prompt).toContain('2 images from recent chat history')
    expect(prompt).toContain('attached in this request')
    expect(prompt).toContain('what is on those images?')
  })
})

describe('buildInitialContents', () => {
  test('packs history images into the same user request as the current question', () => {
    const contents = buildInitialContents(
      'what is on those images?',
      [
        {
          message: {
            message_id: 1,
            text: 'first image context',
          } as unknown as Message,
          media: {
            buffer: Buffer.from([1, 2, 3]),
            mimeType: 'image/jpeg',
            mediaType: 'image',
          },
        },
      ],
      [
        {
          buffer: Buffer.from([4, 5, 6]),
          mimeType: 'image/png',
          mediaType: 'image',
        },
      ],
    )

    expect(contents).toHaveLength(1)
    expect(contents[0]?.role).toBe('user')
    const parts = contents[0]?.parts ?? []
    expect(parts).toHaveLength(4)
    expect(parts[0]?.text).toContain('attached in this request')
    expect(parts[1]?.text).toContain('Context image from recent chat history')
    expect(parts[2]).toHaveProperty('inlineData')
    expect(parts[3]).toHaveProperty('inlineData')
  })
})
