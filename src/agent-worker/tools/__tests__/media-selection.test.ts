import type { MediaBuffer } from '@tg-bot/common'
import { selectMediaForTool } from '../media-selection'

const requestImage: MediaBuffer = {
  buffer: Buffer.from('request-image'),
  mimeType: 'image/jpeg',
  mediaType: 'image',
  origin: 'request',
}
const historyImage: MediaBuffer = {
  buffer: Buffer.from('history-image'),
  mimeType: 'image/jpeg',
  mediaType: 'image',
  origin: 'history',
}
const requestVideo: MediaBuffer = {
  buffer: Buffer.from('request-video'),
  mimeType: 'video/mp4',
  mediaType: 'video',
  origin: 'request',
}

describe('selectMediaForTool', () => {
  test('defaults to supported non-history media', () => {
    expect(
      selectMediaForTool(
        [requestImage, historyImage, requestVideo],
        undefined,
        ['image'],
      ),
    ).toEqual([requestImage])
  })

  test('uses exact stable media IDs when explicitly selected', () => {
    expect(
      selectMediaForTool(
        [requestImage, historyImage, requestVideo],
        [2, 1],
        ['image'],
      ),
    ).toEqual([historyImage, requestImage])
    expect(selectMediaForTool([requestImage], [], ['image'])).toEqual([])
  })

  test('rejects unknown or unsupported media IDs', () => {
    expect(() => selectMediaForTool([requestImage], [2], ['image'])).toThrow(
      'Unknown media_id 2',
    )
    expect(() => selectMediaForTool([requestVideo], [1], ['image'])).toThrow(
      'media_id 1 is video',
    )
  })
})
