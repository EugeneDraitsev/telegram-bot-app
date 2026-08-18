import { createGoogleGenerativeAI } from '@ai-sdk/google'

import { createOmniFetch, GEMINI_OMNI_FLASH_MODEL } from '../google-media'

describe('Google Omni wire request', () => {
  test('patches the actual AI SDK snake_case request before transport', async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchMock = jest.fn(async (_input: unknown, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          error: {
            code: 400,
            message: 'stop after capturing request',
            status: 'INVALID_ARGUMENT',
          },
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      )
    })
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-key',
      fetch: createOmniFetch('16:9', 3, fetchMock as unknown as typeof fetch),
    })

    await expect(
      provider.interactions(GEMINI_OMNI_FLASH_MODEL).doGenerate({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'A fox in snow' }],
          },
        ],
        providerOptions: {
          google: { store: false, responseModalities: ['video'] },
        },
      }),
    ).rejects.toThrow('stop after capturing request')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody).toEqual(
      expect.objectContaining({
        model: GEMINI_OMNI_FLASH_MODEL,
        response_format: expect.arrayContaining([
          expect.objectContaining({
            type: 'video',
            aspect_ratio: '16:9',
            duration: '3s',
            delivery: 'inline',
          }),
        ]),
      }),
    )
    expect(requestBody).not.toHaveProperty('responseFormat')
  })
})
