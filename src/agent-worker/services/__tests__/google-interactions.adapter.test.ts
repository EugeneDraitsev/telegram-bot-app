import {
  adaptOmniInteractionRequest,
  extractLyriaInteractionOutput,
  getGoogleInteractionErrorMessage,
} from '../google-interactions.adapter'

describe('Google Interactions adapter', () => {
  test('adapts the AI SDK request to the documented Omni shape', () => {
    expect(
      adaptOmniInteractionRequest(
        {
          model: 'gemini-omni-flash-preview',
          input: [
            {
              type: 'user_input',
              content: [
                { type: 'image', data: 'base64', mime_type: 'image/jpeg' },
                { type: 'text', text: 'Animate this' },
              ],
            },
          ],
        },
        '9:16',
      ),
    ).toEqual({
      model: 'gemini-omni-flash-preview',
      input: [
        { type: 'image', data: 'base64', mime_type: 'image/jpeg' },
        { type: 'text', text: 'Animate this' },
      ],
      response_format: {
        type: 'video',
        aspect_ratio: '9:16',
        delivery: 'inline',
      },
      store: false,
    })
  })

  test('includes Google error details hidden by the generic message', () => {
    const error = Object.assign(new Error('Bad Request'), {
      responseBody: JSON.stringify({
        error: {
          message: 'Bad Request',
          details: [{ reason: 'MODEL_NOT_AVAILABLE' }],
        },
      }),
    })

    expect(getGoogleInteractionErrorMessage(error)).toContain(
      'MODEL_NOT_AVAILABLE',
    )
  })

  test('reads the legacy outputs envelope', () => {
    expect(
      extractLyriaInteractionOutput({
        id: 'interaction-1',
        outputs: [
          { type: 'text', text: 'Lyrics' },
          {
            type: 'audio',
            mime_type: 'audio/mpeg',
            data: Buffer.from('music').toString('base64'),
          },
        ],
      }),
    ).toEqual({
      buffer: Buffer.from('music'),
      mimeType: 'audio/mpeg',
      interactionId: 'interaction-1',
      text: 'Lyrics',
    })
  })

  test('also reads the standard model output step', () => {
    expect(
      extractLyriaInteractionOutput({
        steps: [
          {
            type: 'model_output',
            content: [
              {
                type: 'audio',
                data: Buffer.from('music').toString('base64'),
              },
            ],
          },
        ],
      }),
    ).toEqual({
      buffer: Buffer.from('music'),
      mimeType: 'audio/mpeg',
      interactionId: undefined,
      text: undefined,
    })
  })

  test('rejects responses without inline audio', () => {
    expect(extractLyriaInteractionOutput({ outputs: [] })).toBeUndefined()
    expect(extractLyriaInteractionOutput(null)).toBeUndefined()
  })
})
