import type { Message } from 'grammy/types'

import {
  getCommandMediaRefs,
  type MediaResolverApi,
  resolveMediaBuffers,
} from '..'

/**
 * Guards the path the agent worker uses to "see" images.
 *
 * Nothing about media travels on SQS except the Telegram message itself, so the
 * worker must be able to go from a raw message to downloaded buffers using only
 * the file_ids embedded in it.
 */
describe('media resolution from a raw Telegram message', () => {
  const originalToken = process.env.TOKEN
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env.TOKEN = 'test-token'
  })

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.TOKEN
    } else {
      process.env.TOKEN = originalToken
    }
    globalThis.fetch = originalFetch
    jest.restoreAllMocks()
  })

  const photoMessage = {
    message_id: 10,
    chat: { id: -100 },
    caption: 'что на фото?',
    photo: [
      { file_id: 'small', file_unique_id: 'u1', width: 100, height: 100 },
      { file_id: 'big', file_unique_id: 'u1', width: 1000, height: 1000 },
    ],
  } as unknown as Message

  test('resolves the largest photo into a downloaded buffer', async () => {
    const getFile = jest.fn().mockResolvedValue({ file_path: 'photos/big.jpg' })
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(new Response('image-bytes')) as unknown as typeof fetch

    const refs = getCommandMediaRefs(photoMessage)
    expect(refs).toEqual([
      expect.objectContaining({ fileId: 'big', mediaType: 'image' }),
    ])

    const buffers = await resolveMediaBuffers(refs, { getFile })

    expect(getFile).toHaveBeenCalledWith('big', expect.any(AbortSignal))
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/file/bottest-token/photos/big.jpg',
      { signal: expect.any(AbortSignal) },
    )
    expect(buffers).toHaveLength(1)
    expect(buffers[0].mimeType).toBe('image/jpeg')
    expect(buffers[0].buffer.toString()).toBe('image-bytes')
    expect(buffers[0].context).toEqual({
      relation: 'current-message',
      messageId: 10,
      text: 'что на фото?',
    })
  })

  test('covers reply and album media the same way', async () => {
    const message = {
      message_id: 11,
      chat: { id: -100 },
      text: 'а тут?',
      media_group_id: 'album',
      reply_to_message: {
        message_id: 9,
        document: {
          file_id: 'doc',
          file_unique_id: 'u2',
          mime_type: 'image/png',
        },
      },
    } as unknown as Message
    const albumMessage = {
      message_id: 12,
      media_group_id: 'album',
      photo: [
        { file_id: 'album_1', file_unique_id: 'u3', width: 800, height: 800 },
      ],
    } as unknown as Message

    const refs = getCommandMediaRefs(message, [albumMessage])

    expect(refs.map((ref) => ref.fileId)).toEqual(['doc', 'album_1'])
  })

  test('skips downloads instead of throwing when TOKEN is missing', async () => {
    delete process.env.TOKEN
    const getFile = jest.fn()

    const buffers = await resolveMediaBuffers(
      getCommandMediaRefs(photoMessage),
      { getFile },
    )

    expect(buffers).toEqual([])
    expect(getFile).not.toHaveBeenCalled()
  })

  test('rejects oversized Telegram metadata without downloading the file', async () => {
    const getFile = jest.fn().mockResolvedValue({
      file_path: 'large.jpg',
      file_size: 20 * 1024 * 1024,
    })
    globalThis.fetch = jest.fn() as unknown as typeof fetch
    expect(
      await resolveMediaBuffers(getCommandMediaRefs(photoMessage), { getFile }),
    ).toEqual([])
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test('cancels oversized responses before reading the body', async () => {
    const cancel = jest.fn()
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-length': String(20 * 1024 * 1024) },
    })
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(response) as unknown as typeof fetch
    const getFile = jest.fn().mockResolvedValue({ file_path: 'large.jpg' })
    expect(
      await resolveMediaBuffers(getCommandMediaRefs(photoMessage), { getFile }),
    ).toEqual([])
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  test('stops a chunked body at the byte limit even with a false content length', async () => {
    const cancel = jest.fn()
    const chunk = new Uint8Array(1024 * 1024)
    let chunks = 0
    const response = new Response(
      new ReadableStream(
        {
          pull(controller) {
            chunks++
            controller.enqueue(chunk)
          },
          cancel,
        },
        { highWaterMark: 0 },
      ),
      { headers: { 'content-length': '1' } },
    )
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(response) as unknown as typeof fetch
    const getFile = jest.fn().mockResolvedValue({ file_path: 'large.jpg' })
    expect(
      await resolveMediaBuffers(getCommandMediaRefs(photoMessage), { getFile }),
    ).toEqual([])
    expect(chunks).toBe(20)
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  test('aborts stalled Telegram metadata using the download deadline', async () => {
    const controller = new AbortController()
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal)
    const getFile = jest.fn(
      (_fileId: string, signal?: Parameters<MediaResolverApi['getFile']>[1]) =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(controller.signal.reason),
            {
              once: true,
            },
          )
        }),
    )
    globalThis.fetch = jest.fn() as unknown as typeof fetch
    const result = resolveMediaBuffers(getCommandMediaRefs(photoMessage), {
      getFile,
    })
    controller.abort(new Error('download timed out'))
    expect(await result).toEqual([])
    expect(timeout).toHaveBeenCalledWith(10_000)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  test('uses the same deadline for a stalled response body', async () => {
    const controller = new AbortController()
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal)
    const getFile = jest.fn().mockResolvedValue({ file_path: 'slow.jpg' })
    globalThis.fetch = jest.fn(async (_url: unknown, options?: RequestInit) => {
      expect(options?.signal).toBe(controller.signal)
      return new Response(
        new ReadableStream({
          start(stream) {
            options?.signal?.addEventListener(
              'abort',
              () => stream.error(controller.signal.reason),
              { once: true },
            )
          },
          pull() {
            controller.abort(new Error('body timed out'))
          },
        }),
      )
    }) as unknown as typeof fetch
    expect(
      await resolveMediaBuffers(getCommandMediaRefs(photoMessage), { getFile }),
    ).toEqual([])
  })

  test('keeps at most three downloads active and preserves media order', async () => {
    let active = 0
    let maxActive = 0
    const getFile = jest.fn(async (id: string) => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      return { file_path: id, file_id: id, file_unique_id: id }
    })
    globalThis.fetch = jest.fn(async () => {
      active--
      return new Response('image')
    }) as unknown as typeof fetch
    const refs = Array.from({ length: 7 }, (_, index) => ({
      mimeType: 'image/jpeg',
      mediaType: 'image' as const,
      fileId: String(index),
    }))
    const result = await resolveMediaBuffers(refs, { getFile })
    expect(maxActive).toBe(3)
    expect(result.map((media) => media.fileId)).toEqual(
      refs.map((ref) => ref.fileId),
    )
  })
})
