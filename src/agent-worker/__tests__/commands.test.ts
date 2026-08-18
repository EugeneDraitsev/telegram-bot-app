import { prepareAgentCommandMessage } from '../commands'

describe('prepareAgentCommandMessage', () => {
  test.each(['e', 'ee', 'ge', 'gp', 'de'])(
    'turns /%s into an explicit image request',
    (commandName) => {
      const message = { text: 'a red fox' } as never

      expect(prepareAgentCommandMessage(message, commandName)).toEqual({
        text: 'Generate or edit an image for this request:\na red fox',
      })
    },
  )

  test('preserves caption-based media commands', () => {
    const message = { caption: 'make it blue', photo: [{}] } as never

    expect(prepareAgentCommandMessage(message, 'e')).toEqual({
      caption: 'Generate or edit an image for this request:\nmake it blue',
      photo: [{}],
    })
  })

  test('does not rewrite text commands', () => {
    const message = { text: 'explain this' } as never

    expect(prepareAgentCommandMessage(message, 'o')).toBe(message)
  })

  test.each([
    [
      'omni',
      'Generate or animate a video for this request with the generate_video_with_veo tool. Default to a 6-second vertical video with native audio unless the user specifies a supported 4, 6, or 8 second duration or another aspect ratio',
    ],
    [
      'lyria',
      'Generate a 30-second music clip for this request with the generate_music_with_lyria tool',
    ],
    [
      'lyriapro',
      'Generate a full-length structured song for this request with the generate_music_with_lyria tool',
    ],
  ])('turns /%s into an explicit media request', (commandName, instruction) => {
    const message = { text: 'neon cats' } as never

    expect(prepareAgentCommandMessage(message, commandName)).toEqual({
      text: `${instruction}:\nneon cats`,
    })
  })

  test('makes an empty /omni command use replied-to media', () => {
    const message = { text: '' } as never

    expect(prepareAgentCommandMessage(message, 'omni')).toEqual({
      text: expect.stringContaining(
        'Use attached or replied-to media when available',
      ),
    })
  })
})
