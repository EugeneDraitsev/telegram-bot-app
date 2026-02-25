import type { Message } from 'telegram-typings'

import { collectMessageImageFileIds } from '..'

describe('collectMessageImageFileIds', () => {
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
