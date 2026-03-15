import type { Message } from 'telegram-typings'

import { collectMediaFileRefs, collectMessageImageFileIds } from '..'

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
