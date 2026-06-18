import type { Message } from 'grammy/types'

import {
  sendRichMessageWithFallback,
  sendThinkingRichDraft,
  startThinkingRichDraftIndicator,
} from '../telegram-rich.utils'

describe('telegram rich utils', () => {
  afterEach(() => {
    jest.useRealTimers()
  })

  test('sends rich messages through native grammy API', async () => {
    const sendRichMessage = jest.fn().mockResolvedValue({ message_id: 10 })
    const sendMessage = jest.fn()

    const result = await sendRichMessageWithFallback({
      api: {
        sendRichMessage,
        sendMessage,
      },
      chatId: 123,
      richMessage: { markdown: '# Stats' },
      fallbackText: 'Stats',
      richOptions: { message_thread_id: 456 },
    })

    expect(result).toEqual({ message_id: 10 })
    expect(sendRichMessage).toHaveBeenCalledWith(
      123,
      { markdown: '# Stats' },
      { message_thread_id: 456 },
      undefined,
    )
    expect(sendMessage).not.toHaveBeenCalled()
  })

  test('falls back to sendMessage when rich messages fail', async () => {
    const sendRichMessage = jest.fn().mockRejectedValue(new Error('bad rich'))
    const sendMessage = jest.fn().mockResolvedValue({ message_id: 11 })

    const result = await sendRichMessageWithFallback({
      api: {
        sendRichMessage,
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
        api: { sendRichMessageDraft },
        message: privateMessage,
        text: 'Thinking <now>',
      }),
    ).resolves.toBe(true)

    expect(sendRichMessageDraft).toHaveBeenCalledWith(
      123,
      77,
      {
        html: '<tg-thinking>Thinking &lt;now&gt;</tg-thinking>',
        skip_entity_detection: true,
      },
      undefined,
      undefined,
    )

    await expect(
      sendThinkingRichDraft({
        api: { sendRichMessageDraft },
        message: {
          message_id: 78,
          chat: { id: -100, type: 'supergroup' },
        } as Message,
      }),
    ).resolves.toBe(false)

    expect(sendRichMessageDraft).toHaveBeenCalledTimes(1)
  })

  test('refreshes thinking draft until stopped', async () => {
    const sendRichMessageDraft = jest.fn().mockResolvedValue(true)
    const message = {
      message_id: 77,
      chat: { id: 123, type: 'private' },
    } as Message

    const stop = startThinkingRichDraftIndicator({
      api: { sendRichMessageDraft },
      message,
      intervalMs: 5,
    })

    expect(sendRichMessageDraft).toHaveBeenCalledTimes(1)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(sendRichMessageDraft.mock.calls.length).toBeGreaterThanOrEqual(2)

    stop()
    const callCountAfterStop = sendRichMessageDraft.mock.calls.length
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(sendRichMessageDraft).toHaveBeenCalledTimes(callCountAfterStop)
  })
})
