import type { Message } from 'telegram-typings'

import {
  sendRichMessageWithFallback,
  sendThinkingRichDraft,
} from '../telegram-rich.utils'

describe('telegram rich utils', () => {
  test('sends rich messages through raw grammy API', async () => {
    const sendRichMessage = jest.fn().mockResolvedValue({ message_id: 10 })
    const sendMessage = jest.fn()

    const result = await sendRichMessageWithFallback({
      api: {
        raw: { sendRichMessage },
        sendMessage,
      },
      chatId: 123,
      richMessage: { markdown: '# Stats' },
      fallbackText: 'Stats',
      richOptions: { message_thread_id: 456 },
    })

    expect(result).toEqual({ message_id: 10 })
    expect(sendRichMessage).toHaveBeenCalledWith(
      {
        chat_id: 123,
        rich_message: { markdown: '# Stats' },
        message_thread_id: 456,
      },
      undefined,
    )
    expect(sendMessage).not.toHaveBeenCalled()
  })

  test('falls back to sendMessage when rich messages fail', async () => {
    const sendRichMessage = jest.fn().mockRejectedValue(new Error('bad rich'))
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 11 })

    const result = await sendRichMessageWithFallback({
      api: {
        raw: { sendRichMessage },
        sendMessage,
      },
      chatId: 123,
      richMessage: { markdown: '# Stats' },
      fallbackText: 'Stats',
      fallbackOptions: { message_thread_id: 456 },
    })

    expect(result).toEqual({ message_id: 11 })
    expect(sendMessage).toHaveBeenCalledWith(123, 'Stats', {
      message_thread_id: 456,
    })
  })

  test('sends thinking draft only for private chats', async () => {
    const sendRichMessageDraft = jest.fn().mockResolvedValue(true)
    const privateMessage = {
      message_id: 77,
      chat: { id: 123, type: 'private' },
    } as Message

    await expect(
      sendThinkingRichDraft({
        api: { raw: { sendRichMessageDraft } },
        message: privateMessage,
        text: 'Thinking <now>',
      }),
    ).resolves.toBe(true)

    expect(sendRichMessageDraft).toHaveBeenCalledWith(
      {
        chat_id: 123,
        draft_id: 77,
        rich_message: {
          html: '<tg-thinking>Thinking &lt;now&gt;</tg-thinking>',
          skip_entity_detection: true,
        },
      },
      undefined,
    )

    await expect(
      sendThinkingRichDraft({
        api: { raw: { sendRichMessageDraft } },
        message: {
          message_id: 78,
          chat: { id: -100, type: 'supergroup' },
        } as Message,
      }),
    ).resolves.toBe(false)

    expect(sendRichMessageDraft).toHaveBeenCalledTimes(1)
  })
})
