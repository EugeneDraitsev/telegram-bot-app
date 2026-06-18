import type { Message, MessageEntity } from 'grammy/types'

import { getRegisteredCommandName } from '../command-registry'

const registry = new Set(['q', 'qq', 'ge', 'gp', 'e'])

describe('getRegisteredCommandName', () => {
  test('returns false for plain bot mention text', () => {
    const message = {
      text: 'ботик Каждый раз, когда я пишу утренний бриф...',
    } as Message

    expect(getRegisteredCommandName(message, registry)).toBeNull()
  })

  test('returns true for leading registered command in text', () => {
    const message = {
      text: '/q summarize this',
      entities: [
        { type: 'bot_command', offset: 0, length: 2 } as MessageEntity,
      ],
    } as Message

    expect(getRegisteredCommandName(message, registry)).toEqual('q')
  })

  test('returns null when command text has no Telegram command entity', () => {
    const message = {
      text: '/q summarize this',
    } as Message

    expect(getRegisteredCommandName(message, registry)).toBeNull()
  })

  test('returns null for command entity after leading whitespace', () => {
    const message = {
      text: '  /q summarize this',
      entities: [
        { type: 'bot_command', offset: 2, length: 2 } as MessageEntity,
      ],
    } as Message

    expect(getRegisteredCommandName(message, registry)).toBeNull()
  })

  test('returns null for command addressed to another bot', () => {
    const message = {
      text: '/q@OtherBot summarize this',
      entities: [
        { type: 'bot_command', offset: 0, length: 11 } as MessageEntity,
      ],
    } as Message

    expect(getRegisteredCommandName(message, registry, 'OurBot')).toBeNull()
  })

  test('returns command addressed to this bot', () => {
    const message = {
      text: '/q@OurBot summarize this',
      entities: [
        { type: 'bot_command', offset: 0, length: 9 } as MessageEntity,
      ],
    } as Message

    expect(getRegisteredCommandName(message, registry, 'OurBot')).toEqual('q')
  })

  test('parses command before newline with the same rule as registration', () => {
    const message = {
      text: '/q\nsummarize this',
      entities: [
        { type: 'bot_command', offset: 0, length: 2 } as MessageEntity,
      ],
    } as Message

    expect(getRegisteredCommandName(message, registry)).toEqual('q')
  })

  test('returns true for leading registered command in caption', () => {
    const message = {
      caption: '/ge make it brighter',
      caption_entities: [
        { type: 'bot_command', offset: 0, length: 3 } as MessageEntity,
      ],
    } as Message

    expect(getRegisteredCommandName(message, registry)).toEqual('ge')
  })

  test('returns true for leading registered pro image command in caption', () => {
    const message = {
      caption: '/gp make it cinematic',
      caption_entities: [
        { type: 'bot_command', offset: 0, length: 3 } as MessageEntity,
      ],
    } as Message

    expect(getRegisteredCommandName(message, registry)).toEqual('gp')
  })

  test('returns false for unknown command', () => {
    const message = {
      text: '/unknown command',
      entities: [
        { type: 'bot_command', offset: 0, length: 8 } as MessageEntity,
      ],
    } as Message

    expect(getRegisteredCommandName(message, registry)).toBeNull()
  })
})
