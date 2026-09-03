import type { Context } from 'grammy/web'

import { saveBotMessageMiddleware } from '../bot.utils'

type TestReplyMethod = (...args: unknown[]) => Promise<unknown>
const callReplyMethod = (method: unknown, ...args: unknown[]) =>
  (method as TestReplyMethod)(...args)

describe('saveBotMessageMiddleware', () => {
  test('saves a photo reply and preserves the method result', async () => {
    const sentMessage = { message_id: 1, chat: { id: 123 } }
    const replyWithPhoto = jest.fn(async () => sentMessage)
    const saveReply = jest.fn(async (_messageLike: unknown) => {})
    const ctx = { replyWithPhoto } as unknown as Context
    let result: unknown

    await saveBotMessageMiddleware(
      ctx,
      async () => {
        result = await callReplyMethod(ctx.replyWithPhoto, 'photo-id')
      },
      saveReply,
    )

    expect(replyWithPhoto).toHaveBeenCalledWith('photo-id')
    expect(saveReply).toHaveBeenCalledWith(sentMessage)
    expect(result).toBe(sentMessage)
  })

  test('saves every message returned by a media group', async () => {
    const sentMessages = [
      { message_id: 1, chat: { id: 123 } },
      { message_id: 2, chat: { id: 123 } },
    ]
    const replyWithMediaGroup = jest.fn(async () => sentMessages)
    const saveReply = jest.fn(async (_messageLike: unknown) => {})
    const ctx = { replyWithMediaGroup } as unknown as Context
    let result: unknown

    await saveBotMessageMiddleware(
      ctx,
      async () => {
        result = await callReplyMethod(ctx.replyWithMediaGroup, [])
      },
      saveReply,
    )

    expect(saveReply).toHaveBeenCalledTimes(2)
    expect(saveReply).toHaveBeenNthCalledWith(1, sentMessages[0])
    expect(saveReply).toHaveBeenNthCalledWith(2, sentMessages[1])
    expect(result).toBe(sentMessages)
  })
})
