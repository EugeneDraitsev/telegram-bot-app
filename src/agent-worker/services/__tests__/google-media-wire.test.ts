import { createGoogleGenerativeAI } from '@ai-sdk/google'

import { VEO_3_1_LITE_MODEL } from '../google-media'

describe('Google Veo wire request', () => {
  test('uses the native AI SDK video endpoint and Veo parameters', async () => {
    const requests: Array<{
      url: string
      body?: Record<string, unknown>
    }> = []
    const fetchMock = jest.fn(async (input: unknown, init?: RequestInit) => {
      requests.push({
        url: String(input),
        body: init?.body
          ? (JSON.parse(String(init.body)) as Record<string, unknown>)
          : undefined,
      })
      return new Response(
        JSON.stringify(
          init?.method === 'POST'
            ? { name: 'operations/video-1' }
            : {
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
              },
        ),
        { headers: { 'content-type': 'application/json' } },
      )
    })
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
    })
    const model = provider.video(VEO_3_1_LITE_MODEL)
    if (!model.doStart || !model.doStatus) {
      throw new Error('Google video model must support asynchronous operations')
    }

    const start = await model.doStart({
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
    const result = await model.doStatus({
      operation: start.operation,
      headers: {},
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(requests[0]?.url).toBe(
      `https://generativelanguage.googleapis.com/v1beta/models/${VEO_3_1_LITE_MODEL}:predictLongRunning`,
    )
    expect(requests[0]?.body).toEqual({
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
    expect(requests[1]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/operations/video-1',
    )
    expect(result.status).toBe('completed')
    if (result.status !== 'completed') {
      throw new Error('Google video operation did not complete')
    }
    expect(result.videos).toEqual([
      {
        type: 'url',
        url: 'https://generativelanguage.googleapis.com/v1beta/files/video-1:download?key=test-key',
        mediaType: 'video/mp4',
      },
    ])
  })
})
