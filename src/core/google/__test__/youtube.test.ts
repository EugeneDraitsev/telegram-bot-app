// eslint-disable-next-line import/no-extraneous-dependencies
import mockAxios from 'jest-mock-axios'

import { searchYoutube } from '../youtube'

describe('searchYoutube', () => {
  beforeEach(() => {
    mockAxios.reset()
  })
  test('should return of youtube video:', async () => {
    const promise = searchYoutube('test query')
    mockAxios.mockResponse({ data: { items: [{ id: { videoId: 4 } }] } })

    expect(await promise).toEqual('https://youtu.be/4')
  })
  test('should return proper string when videos is not found', async () => {
    const promise = searchYoutube('test query')
    mockAxios.mockResponse({ data: {} })

    expect(await promise).toEqual('No videos found')
  })
  test('should return proper string when something will go wrong', async () => {
    const promise = searchYoutube('test query')
    mockAxios.mockResponse({ data: 'BROKEN JSON', status: 500 })

    expect(await promise).toEqual('No videos found')
  })
})
