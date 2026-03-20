import type { Message } from 'telegram-typings'

import {
  collectHistoryMediaFileRefs,
  collectMediaFileRefs,
  collectMessageImageFileIds,
} from '..'

describe('collectMessageImageFileIds (backward compat)', () => {
  test('collects direct image ids from message and reply context', () => {
    const message = {
      photo: [
        { file_id: 'm_small', width: 100, height: 100, file_unique_id: 'm' },
        { file_id: 'm_big', width: 1000, height: 1000, file_unique_id: 'm' },
      ],
      reply_to_message: {
        photo: [
          {
            file_id: 'r_small',
            width: 100,
            height: 100,
            file_unique_id: 'r',
          },
          {
            file_id: 'r_big',
            width: 1000,
            height: 1000,
            file_unique_id: 'r',
          },
        ],
        sticker: { file_id: 'sticker_1' },
      },
    } as unknown as Message

    expect(collectMessageImageFileIds(message)).toEqual([
      'm_big',
      'r_big',
      'sticker_1',
    ])
  })

  test('preserves initial ids and deduplicates output', () => {
    const message = {
      photo: [
        { file_id: 'm_big', width: 1000, height: 1000, file_unique_id: 'm' },
      ],
      reply_to_message: {
        sticker: { file_id: 'sticker_1' },
      },
    } as unknown as Message

    expect(
      collectMessageImageFileIds(message, ['m_big', 'seed_1', 'sticker_1']),
    ).toEqual(['m_big', 'seed_1', 'sticker_1'])
  })
})

describe('collectMediaFileRefs', () => {
  test('collects photo as image media ref', () => {
    const message = {
      photo: [
        { file_id: 'p_small', width: 100, height: 100, file_unique_id: 'p' },
        { file_id: 'p_big', width: 1000, height: 1000, file_unique_id: 'p' },
      ],
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([
      { fileId: 'p_big', mimeType: 'image/jpeg', mediaType: 'image' },
    ])
  })

  test('collects document with image mime type', () => {
    const message = {
      document: { file_id: 'doc_1', mime_type: 'image/png' },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([
      { fileId: 'doc_1', mimeType: 'image/png', mediaType: 'image' },
    ])
  })

  test('ignores document with non-image mime type', () => {
    const message = {
      document: { file_id: 'doc_pdf', mime_type: 'application/pdf' },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([])
  })

  test('collects voice message', () => {
    const message = {
      voice: { file_id: 'voice_1', mime_type: 'audio/ogg' },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([
      { fileId: 'voice_1', mimeType: 'audio/ogg', mediaType: 'audio' },
    ])
  })

  test('collects video', () => {
    const message = {
      video: { file_id: 'video_1', mime_type: 'video/mp4' },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([
      { fileId: 'video_1', mimeType: 'video/mp4', mediaType: 'video' },
    ])
  })

  test('collects raster sticker as image/webp', () => {
    const message = {
      sticker: { file_id: 'sticker_raster' },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([
      { fileId: 'sticker_raster', mimeType: 'image/webp', mediaType: 'image' },
    ])
  })

  test('collects video sticker as video/webm', () => {
    const message = {
      sticker: { file_id: 'sticker_video', is_video: true },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([
      { fileId: 'sticker_video', mimeType: 'video/webm', mediaType: 'video' },
    ])
  })

  test('skips animated sticker', () => {
    const message = {
      sticker: { file_id: 'sticker_animated', is_animated: true },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([])
  })

  test('returns initialRefs for undefined message', () => {
    const refs = collectMediaFileRefs(undefined)
    expect(refs).toEqual([])
  })

  test('collects video_note', () => {
    const message = {
      video_note: { file_id: 'vnote_1' },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([
      { fileId: 'vnote_1', mimeType: 'video/mp4', mediaType: 'video' },
    ])
  })

  test('collects media from reply_to_message', () => {
    const message = {
      reply_to_message: {
        voice: { file_id: 'reply_voice', mime_type: 'audio/ogg' },
      },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toEqual([
      { fileId: 'reply_voice', mimeType: 'audio/ogg', mediaType: 'audio' },
    ])
  })

  test('deduplicates by fileId', () => {
    const message = {
      video: { file_id: 'same_id', mime_type: 'video/mp4' },
      reply_to_message: {
        video: { file_id: 'same_id', mime_type: 'video/mp4' },
      },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toHaveLength(1)
  })

  test('collects multiple media types from one message', () => {
    const message = {
      photo: [
        { file_id: 'photo_1', width: 800, height: 600, file_unique_id: 'ph' },
      ],
      voice: { file_id: 'voice_1', mime_type: 'audio/ogg' },
      reply_to_message: {
        video: { file_id: 'video_1', mime_type: 'video/mp4' },
      },
    } as unknown as Message

    const refs = collectMediaFileRefs(message)
    expect(refs).toHaveLength(3)
    expect(refs.map((r) => r.mediaType).sort()).toEqual([
      'audio',
      'image',
      'video',
    ])
  })
})

describe('collectHistoryMediaFileRefs', () => {
  test('collects recent images from history, skips current message and deduplicates', () => {
    const messages = [
      {
        message_id: 1,
        photo: [
          {
            file_id: 'old_small',
            width: 100,
            height: 100,
            file_unique_id: 'old',
          },
          {
            file_id: 'old_big',
            width: 1000,
            height: 1000,
            file_unique_id: 'old',
          },
        ],
      },
      {
        message_id: 2,
        text: 'just text',
      },
      {
        message_id: 3,
        document: { file_id: 'doc_image', mime_type: 'image/png' },
      },
      {
        message_id: 4,
        photo: [
          {
            file_id: 'current_small',
            width: 100,
            height: 100,
            file_unique_id: 'current',
          },
          {
            file_id: 'current_big',
            width: 1000,
            height: 1000,
            file_unique_id: 'current',
          },
        ],
      },
      {
        message_id: 5,
        photo: [
          {
            file_id: 'old_big',
            width: 1000,
            height: 1000,
            file_unique_id: 'old',
          },
        ],
      },
    ] as unknown as Message[]

    const refs = collectHistoryMediaFileRefs(messages, {
      excludeMessageId: 4,
      mediaTypes: ['image'],
    })

    expect(refs).toEqual([
      {
        ref: { fileId: 'old_big', mimeType: 'image/jpeg', mediaType: 'image' },
        message: messages[0],
      },
      {
        ref: { fileId: 'doc_image', mimeType: 'image/png', mediaType: 'image' },
        message: messages[2],
      },
    ])
  })

  test('respects recent history limit before collecting media refs', () => {
    const messages = [
      {
        message_id: 1,
        photo: [
          { file_id: 'old_1', width: 1000, height: 1000, file_unique_id: '1' },
        ],
      },
      {
        message_id: 2,
        photo: [
          { file_id: 'old_2', width: 1000, height: 1000, file_unique_id: '2' },
        ],
      },
      {
        message_id: 3,
        photo: [
          {
            file_id: 'recent_3',
            width: 1000,
            height: 1000,
            file_unique_id: '3',
          },
        ],
      },
      {
        message_id: 4,
        photo: [
          {
            file_id: 'recent_4',
            width: 1000,
            height: 1000,
            file_unique_id: '4',
          },
        ],
      },
    ] as unknown as Message[]

    const refs = collectHistoryMediaFileRefs(messages, {
      limit: 2,
      mediaTypes: ['image'],
    })

    expect(refs.map((entry) => entry.ref.fileId)).toEqual([
      'recent_3',
      'recent_4',
    ])
  })

  test('can pull replied-to image into history context for a recent reply', () => {
    const originalImageMessage = {
      message_id: 1,
      caption: 'look at this',
      photo: [
        {
          file_id: 'reply_context_image',
          width: 1000,
          height: 1000,
          file_unique_id: 'reply-context',
        },
      ],
    } as unknown as Message
    const recentReply = {
      message_id: 2,
      text: 'what is happening on this image?',
      reply_to_message: originalImageMessage,
    } as unknown as Message

    const refs = collectHistoryMediaFileRefs(
      [originalImageMessage, recentReply],
      {
        limit: 1,
        mediaTypes: ['image'],
      },
    )

    expect(refs).toEqual([
      {
        ref: {
          fileId: 'reply_context_image',
          mimeType: 'image/jpeg',
          mediaType: 'image',
        },
        message: recentReply,
      },
    ])
  })
})
