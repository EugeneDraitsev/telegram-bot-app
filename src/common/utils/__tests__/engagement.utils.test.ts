import type { Message } from 'telegram-typings'

import { isReplyToAnotherBot, isReplyToOurBot } from '../engagement.utils'

describe('engagement utils', () => {
  test('isReplyToOurBot returns true only for matching bot id', () => {
    const message = {
      reply_to_message: { from: { is_bot: true, id: 111 } },
    } as Message

    expect(isReplyToOurBot(message, 111)).toEqual(true)
    expect(isReplyToOurBot(message, 222)).toEqual(false)
    expect(isReplyToOurBot(message)).toEqual(false)
  })

  test('isReplyToAnotherBot does not classify another bot when own bot id is unknown', () => {
    const message = {
      reply_to_message: { from: { is_bot: true, id: 111 } },
    } as Message

    expect(isReplyToAnotherBot(message)).toEqual(false)
  })

  test('isReplyToAnotherBot returns true only for a different bot id', () => {
    const message = {
      reply_to_message: { from: { is_bot: true, id: 111 } },
    } as Message

    expect(isReplyToAnotherBot(message, 111)).toEqual(false)
    expect(isReplyToAnotherBot(message, 222)).toEqual(true)
  })
})
