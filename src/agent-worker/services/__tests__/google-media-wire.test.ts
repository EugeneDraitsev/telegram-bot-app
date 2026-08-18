import { createGoogleGenerativeAI } from '@ai-sdk/google'

import { VEO_3_1_LITE_MODEL } from '../google-media'

describe('Google Veo wire request', () => {
  test('uses the native AI SDK video endpoint and Veo parameters', async () => {
    let requestUrl: string | undefined
    let requestBody: Record<string, unknown> | undefined
    const fetchMock = jest.fn(async (input: unknown, init?: RequestInit) => {
      requestUrl = String(input)
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          name: 'operations/video-1',
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [
                {
                  video: {
                    uri: 'https://generativelanguage.googleapis.com/v1beta/files/video-1:download',
                  },
                },
              ],
            },
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      )
    })
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
    })

    const result = await provider.video(VEO_3_1_LITE_MODEL).doGenerate({
      prompt: 'A fox in snow',
      n: 1,
      aspectRatio: '16:9',
      resolution: '1280x720',
      duration: 6,
      fps: undefined,
      seed: undefined,
      image: {
        type: 'file',
        data: new Uint8Array(Buffer.from('image')),
        mediaType: 'image/jpeg',
      },
      frameImages: undefined,
      inputReferences: undefined,
      generateAudio: true,
      providerOptions: { google: { pollTimeoutMs: 160_000 } },
      headers: {},
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestUrl).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${VEO_3_1_LITE_MODEL}:predictLongRunning`,
    )
    expect(requestBody).toEqual({
      instances: [
        {
          prompt: 'A fox in snow',
          image: {
            bytesBase64Encoded: 'aW1hZ2U=',
            mimeType: 'image/jpeg',
          },
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: '16:9',
        resolution: '720p',
        durationSeconds: 6,
      },
    })
    expect(result.videos).toEqual([
      {
        type: 'url',
        url: 'https://generativelanguage.googleapis.com/v1beta/files/video-1:download?key=test-key',
        mediaType: 'video/mp4',
      },
    ])
  })
})
