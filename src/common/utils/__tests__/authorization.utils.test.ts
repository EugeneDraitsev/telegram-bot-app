import type { Api } from 'grammy'
import type { Message } from 'grammy/types'

import { isMessageAuthorChatAdmin } from '../authorization.utils'

const groupMessage = {
  message_id: 1,
  chat: { id: -100, type: 'group' },
  from: { id: 7 },
} as Message

function apiWithStatus(status: string) {
  return {
    getChatMember: jest.fn().mockResolvedValue({ status }),
  } as unknown as Pick<Api, 'getChatMember'>
}

describe('isMessageAuthorChatAdmin', () => {
  test.each(['creator', 'administrator'])(
    'allows Telegram chat %s',
    async (status) => {
      expect(
        await isMessageAuthorChatAdmin(groupMessage, apiWithStatus(status)),
      ).toBe(true)
    },
  )

  test('rejects regular members and failed lookups', async () => {
    expect(
      await isMessageAuthorChatAdmin(groupMessage, apiWithStatus('member')),
    ).toBe(false)

    const failingApi = {
      getChatMember: jest.fn().mockRejectedValue(new Error('Telegram error')),
    } as unknown as Pick<Api, 'getChatMember'>
    expect(await isMessageAuthorChatAdmin(groupMessage, failingApi)).toBe(false)
  })

  test('allows private-chat authors without an API lookup', async () => {
    const message = {
      message_id: 1,
      chat: { id: 7, type: 'private' },
      from: { id: 7 },
    } as Message

    expect(await isMessageAuthorChatAdmin(message)).toBe(true)
  })

  test('fails closed when identity or API context is unavailable', async () => {
    expect(await isMessageAuthorChatAdmin(undefined)).toBe(false)
    expect(await isMessageAuthorChatAdmin(groupMessage)).toBe(false)
  })
})
