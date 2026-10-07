import type { Message } from 'grammy/types'

import { getMessageSafetyIdentifier } from './safety-identifier.utils'

const message = (userId: number, chatId = 123) =>
  ({ from: { id: userId }, chat: { id: chatId } }) as Message

describe('message safety identifier', () => {
  test('attributes different users separately and keeps one user stable across chats', () => {
    const id = getMessageSafetyIdentifier(message(7))
    expect(id).toMatch(/^[a-f0-9]{64}$/)
    expect(id).toBe(getMessageSafetyIdentifier(message(7, 456)))
    expect(id).not.toBe(getMessageSafetyIdentifier(message(8)))
  })

  test.each([
    ['user', message(7)],
    ['sender chat', { ...message(7), sender_chat: { id: -100123 } } as Message],
    ['chat fallback', { chat: { id: 123 } } as Message],
  ])('keeps %s attribution within the Responses API limit', (_, input) => {
    expect(getMessageSafetyIdentifier(input as Message)).toHaveLength(64)
  })

  test('uses the sender chat for anonymous/channel messages instead of a shared bot user', () => {
    const first = {
      ...message(1087968824),
      sender_chat: { id: -100123 },
    } as Message
    const second = { ...first, sender_chat: { id: -100456 } } as Message
    expect(getMessageSafetyIdentifier(first)).not.toBe(
      getMessageSafetyIdentifier(second),
    )
  })

  test('falls back to a stable chat actor when the sender is unavailable', () => {
    const first = { chat: { id: 123 } } as Message
    expect(getMessageSafetyIdentifier(first)).toBe(
      getMessageSafetyIdentifier(first),
    )
    expect(getMessageSafetyIdentifier(first)).not.toBe(
      getMessageSafetyIdentifier(message(123)),
    )
    expect(getMessageSafetyIdentifier()).toBeUndefined()
  })
})
