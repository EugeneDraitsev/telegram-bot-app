import {
  adaptOmniInteractionRequest,
  extractLyriaInteractionOutput,
} from '../google-interactions.adapter'

describe('Google Interactions adapter', () => {
  test('adapts the AI SDK request to the documented Omni shape', () => {
    expect(
      adaptOmniInteractionRequest(
        {
          model: 'gemini-omni-flash-preview',
          response_format: [{ type: 'text', mime_type: 'text/plain' }],
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
        5,
      ),
    ).toEqual({
      model: 'gemini-omni-flash-preview',
      response_format: [
        { type: 'text', mime_type: 'text/plain' },
        {
          type: 'video',
          aspect_ratio: '9:16',
          duration: '5s',
          delivery: 'inline',
        },
      ],
      input: [
        {
          type: 'user_input',
          content: [
            { type: 'image', data: 'base64', mime_type: 'image/jpeg' },
            { type: 'text', text: 'Animate this' },
          ],
        },
      ],
    })
  })

  test('updates an SDK video entry without duplicating it', () => {
    expect(
      adaptOmniInteractionRequest(
        {
          response_format: [
            { type: 'video', mime_type: 'video/mp4', delivery: 'uri' },
          ],
        },
        '16:9',
        3,
      ),
    ).toEqual({
      response_format: [
        {
          type: 'video',
          mime_type: 'video/mp4',
          aspect_ratio: '16:9',
          duration: '3s',
          delivery: 'inline',
        },
      ],
    })
  })

  test('rejects a changed SDK request casing instead of sending both keys', () => {
    expect(() =>
      adaptOmniInteractionRequest(
        { responseFormat: [{ type: 'text' }] },
        '9:16',
        5,
      ),
    ).toThrow('unexpectedly used camelCase responseFormat')
    expect(() =>
      adaptOmniInteractionRequest('not-an-object', '9:16', 5),
    ).toThrow('request body must be a JSON object')
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
      text: undefined,
    })
  })

  test('rejects responses without inline audio', () => {
    expect(extractLyriaInteractionOutput({ outputs: [] })).toBeUndefined()
    expect(extractLyriaInteractionOutput(null)).toBeUndefined()
  })
})
