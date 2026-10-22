import { searchYoutube } from '../youtube'

describe('searchYoutube', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('should return of youtube video:', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ items: [{ id: { videoId: '4' } }] }),
      )

    const promise = searchYoutube('test query')

    expect(await promise).toEqual('https://youtu.be/4')
  })
  test('should return proper string when videos is not found', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}))

    const promise = searchYoutube('test query 2')

    expect(await promise).toEqual('No videos found')
  })
  test('should return proper string when something will go wrong', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce('error')
    const promise = searchYoutube('test query 3')

    expect(await promise).toEqual('No videos found')
  })
})
