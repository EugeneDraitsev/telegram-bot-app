import type { Message, MessageEntity } from 'telegram-typings'

import { isRegisteredCommandMessage } from '../command-registry'

const registry = new Set(['q', 'qq', 'ge', 'e'])

describe('isRegisteredCommandMessage', () => {
  test('returns false for plain bot mention text', () => {
    const message = {
      text: 'ботик Каждый раз, когда я пишу утренний бриф...',
    } as Message

    expect(isRegisteredCommandMessage(message, registry)).toEqual(false)
  })

  test('returns true for leading registered command in text', () => {
    const message = {
      text: '/q summarize this',
      entities: [
        { type: 'bot_command', offset: 0, length: 2 } as MessageEntity,
      ],
    } as Message

    expect(isRegisteredCommandMessage(message, registry)).toEqual(true)
  })

  test('returns true for leading registered command in caption', () => {
    const message = {
      caption: '/ge make it brighter',
      caption_entities: [
        { type: 'bot_command', offset: 0, length: 3 } as MessageEntity,
      ],
    } as Message

    expect(isRegisteredCommandMessage(message, registry)).toEqual(true)
  })

  test('returns false for unknown command', () => {
    const message = {
      text: '/unknown command',
      entities: [
        { type: 'bot_command', offset: 0, length: 8 } as MessageEntity,
      ],
    } as Message

    expect(isRegisteredCommandMessage(message, registry)).toEqual(false)
  })
})
