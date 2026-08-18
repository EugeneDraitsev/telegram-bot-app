import { createOpenAI } from '@ai-sdk/openai'

describe('OpenAI audio wire request', () => {
  test('forwards Telegram audio file parts through the Responses API', async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchMock = jest.fn(async (_input: unknown, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          error: {
            message: 'stop after capturing request',
            type: 'invalid_request_error',
          },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      )
    })
    const provider = createOpenAI({
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
    })

    await expect(
      provider.responses('gpt-5.6-luna').doGenerate({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: { type: 'data', data: Buffer.from('voice') },
                mediaType: 'audio/ogg',
              },
            ],
          },
        ],
        providerOptions: {
          openai: { passThroughUnsupportedFiles: true },
        },
      }),
    ).rejects.toThrow('stop after capturing request')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody).toEqual(
      expect.objectContaining({
        input: [
          expect.objectContaining({
            content: [
              expect.objectContaining({
                type: 'input_file',
                file_data: 'data:audio/ogg;base64,dm9pY2U=',
              }),
            ],
          }),
        ],
      }),
    )
  })
})
