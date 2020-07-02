import { searchYoutube } from '../youtube'
import { fetchMock } from '../../../__mocks__/fetchMock'

describe('searchYoutube', () => {
  beforeEach(() => {
    fetchMock.resetMocks()
  })
  test('should return of youtube video:', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ items: [{ id: { videoId: 4 } }] }))

    expect(await searchYoutube('test query')).toEqual('https://youtu.be/4')
  })
  test('should return proper string when videos is not found', async () => {
    fetchMock.mockResponseOnce(JSON.stringify({}))

    expect(await searchYoutube('test query')).toEqual('No videos found')
  })
  test('should return proper string when something will go wrong', async () => {
    fetchMock.mockResponseOnce('BROKEN JSON')

    expect(await searchYoutube('test query')).toEqual('No videos found')
  })
})
