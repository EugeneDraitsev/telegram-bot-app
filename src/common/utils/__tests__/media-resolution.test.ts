import type { Message } from 'grammy/types'

import { getCommandMediaRefs, resolveMediaBuffers } from '..'

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
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode('image-bytes').buffer,
    }) as unknown as typeof fetch

    const refs = getCommandMediaRefs(photoMessage)
    expect(refs).toEqual([
      expect.objectContaining({ fileId: 'big', mediaType: 'image' }),
    ])

    const buffers = await resolveMediaBuffers(refs, { getFile })

    expect(getFile).toHaveBeenCalledWith('big')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.telegram.org/file/bottest-token/photos/big.jpg',
    )
    expect(buffers).toHaveLength(1)
    expect(buffers[0].mimeType).toBe('image/jpeg')
    expect(buffers[0].buffer.toString()).toBe('image-bytes')
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
})
