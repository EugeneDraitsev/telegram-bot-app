import type { Message } from 'telegram-typings'

import { buildContextBlock } from '../context'

const BASE_MESSAGE = {
  message_id: 55,
  date: 1_710_000_000,
  text: 'current message',
  chat: { id: 777, type: 'group' },
  from: { id: 123, is_bot: false, first_name: 'Eugene', username: 'eugene' },
} as Message

describe('buildContextBlock', () => {
  test('includes recent history when it is provided', () => {
    const contextBlock = buildContextBlock(
      BASE_MESSAGE,
      'current message',
      false,
      undefined,
      {
        recentHistory: '[10:00:00] User 1: previous message',
      },
    )

    expect(contextBlock).toContain('- Recent chat history:')
    expect(contextBlock).toContain('[10:00:00] User 1: previous message')
  })
})
