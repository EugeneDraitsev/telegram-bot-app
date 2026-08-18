import { extractLyriaInteractionOutput } from '../google-interactions.adapter'

describe('Google Interactions adapter', () => {
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
