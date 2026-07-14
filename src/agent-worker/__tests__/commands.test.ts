import { prepareAgentCommandMessage } from '../commands'

describe('prepareAgentCommandMessage', () => {
  test.each([
    'e',
    'ee',
    'ge',
    'gp',
    'de',
  ])('turns /%s into an explicit image request', (commandName) => {
    const message = { text: 'a red fox' } as never

    expect(prepareAgentCommandMessage(message, commandName)).toEqual({
      text: 'Generate or edit an image for this request:\na red fox',
    })
  })

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
})
