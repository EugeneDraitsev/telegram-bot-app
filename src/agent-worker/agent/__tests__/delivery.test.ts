import type { TelegramApi } from '../../types'

type TestTelegramApi = TelegramApi & {
  sendMessage: jest.Mock
  sendPhoto: jest.Mock
  sendVoice: jest.Mock
  sendVideo: jest.Mock
  sendAnimation: jest.Mock
  sendSticker: jest.Mock
  sendDice: jest.Mock
  sendChatAction: jest.Mock
  sendRichMessage: jest.Mock
  sendRichMessageDraft: jest.Mock
}

const mockSaveBotReplyToHistory = jest.fn()
const mockSendRichMessageWithFallback = jest.fn(
  async (params: {
    api: TestTelegramApi
    chatId: number
    richMessage: unknown
    fallbackText: string
    richOptions?: Record<string, unknown>
    fallbackOptions?: Record<string, unknown>
  }) => {
    try {
      return await params.api.sendRichMessage(
        params.chatId,
        params.richMessage,
        params.richOptions,
        undefined,
      )
    } catch {
      return params.api.sendMessage(
        params.chatId,
        params.fallbackText,
        params.fallbackOptions,
      )
    }
  },
)
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

jest.mock('@tg-bot/common', () => ({
  cleanModelMessage: (text: string) => text,
  formatTelegramMarkdownV2: (text: string) => text,
  logger: mockLogger,
  saveBotReplyToHistory: mockSaveBotReplyToHistory,
  sendRichMessageWithFallback: mockSendRichMessageWithFallback,
}))

import { sendResponses } from '../delivery'

function createApi(): TestTelegramApi {
  return {
    getChatMember: jest.fn(),
    getFile: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
    sendRichMessage: jest.fn().mockResolvedValue({ message_id: 8 }),
    sendRichMessageDraft: jest.fn().mockResolvedValue(true),
    sendPhoto: jest.fn().mockResolvedValue({ message_id: 2 }),
    sendVoice: jest.fn().mockResolvedValue({ message_id: 3 }),
    sendVideo: jest.fn().mockResolvedValue({ message_id: 4 }),
    sendAnimation: jest.fn().mockResolvedValue({ message_id: 5 }),
    sendSticker: jest.fn().mockResolvedValue({ message_id: 6 }),
    sendDice: jest.fn().mockResolvedValue({ message_id: 7 }),
    sendChatAction: jest.fn(),
  }
}

describe('sendResponses', () => {
  beforeEach(() => {
    mockSaveBotReplyToHistory.mockClear()
    mockSaveBotReplyToHistory.mockResolvedValue(undefined)
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
    mockSendRichMessageWithFallback.mockClear()
  })

  test('uses rich delivery for text-only responses', async () => {
    const api = createApi()
    api.sendRichMessage.mockResolvedValueOnce({ message_id: 9 })

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [{ type: 'text', text: '# hello\n\n| A | B |' }],
    })

    expect(api.sendRichMessage).toHaveBeenCalledTimes(1)
    expect(api.sendRichMessage).toHaveBeenCalledWith(
      123,
      { markdown: '# hello\n\n| A | B |' },
      { reply_parameters: { message_id: 456 } },
      undefined,
    )
    expect(api.sendMessage).not.toHaveBeenCalled()
    expect(mockSaveBotReplyToHistory).toHaveBeenCalledWith({ message_id: 9 })
  })

  test('sends rich responses directly with plain text fallback', async () => {
    const api = createApi()
    api.sendRichMessage.mockResolvedValueOnce({ message_id: 10 })

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        {
          type: 'rich',
          richMessage: {
            html: '<tg-math-block>x^2</tg-math-block>',
            skip_entity_detection: true,
          },
          fallbackText: 'x^2',
        },
      ],
    })

    expect(mockSendRichMessageWithFallback).toHaveBeenCalledWith({
      api,
      chatId: 123,
      richMessage: {
        html: '<tg-math-block>x^2</tg-math-block>',
        skip_entity_detection: true,
      },
      fallbackText: 'x^2',
      richOptions: { reply_parameters: { message_id: 456 } },
      fallbackOptions: { reply_parameters: { message_id: 456 } },
    })
    expect(api.sendMessage).not.toHaveBeenCalled()
    expect(mockSaveBotReplyToHistory).toHaveBeenCalledWith({ message_id: 10 })
  })

  test('sends voice with text as a single captioned message', async () => {
    const api = createApi()

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        { type: 'text', text: 'hello there' },
        { type: 'voice', buffer: Buffer.from('voice') },
      ],
    })

    expect(api.sendVoice).toHaveBeenCalledTimes(1)
    expect(api.sendVoice).toHaveBeenCalledWith(
      123,
      expect.anything(),
      expect.objectContaining({
        caption: 'hello there',
        parse_mode: 'MarkdownV2',
        reply_parameters: { message_id: 456 },
      }),
    )
    expect(api.sendRichMessage).not.toHaveBeenCalled()
    expect(api.sendMessage).not.toHaveBeenCalled()
    expect(api.sendPhoto).not.toHaveBeenCalled()
  })

  test('keeps sibling image when voice has no text', async () => {
    const api = createApi()

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        { type: 'image', url: 'https://example.com/image.png' },
        { type: 'voice', buffer: Buffer.from('voice') },
      ],
    })

    expect(api.sendPhoto).toHaveBeenCalledTimes(1)
    expect(api.sendPhoto).toHaveBeenCalledWith(
      123,
      'https://example.com/image.png',
      expect.objectContaining({
        reply_parameters: { message_id: 456 },
      }),
    )
    expect(api.sendVoice).toHaveBeenCalledTimes(1)
    expect(api.sendVoice).toHaveBeenCalledWith(123, expect.anything(), {
      reply_parameters: { message_id: 456 },
    })
  })

  test('keeps sibling dice when voice has no text', async () => {
    const api = createApi()

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        { type: 'dice', emoji: 'dice' },
        { type: 'voice', buffer: Buffer.from('voice') },
      ],
    })

    expect(api.sendDice).toHaveBeenCalledTimes(1)
    expect(api.sendDice).toHaveBeenCalledWith(123, 'dice', {
      reply_parameters: { message_id: 456 },
    })
    expect(api.sendVoice).toHaveBeenCalledTimes(1)
  })

  test('still sends text when sticker delivery fails', async () => {
    const api = createApi()
    api.sendSticker.mockRejectedValueOnce(new Error('bad sticker'))

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        { type: 'text', text: 'hello there' },
        { type: 'sticker', fileId: 'broken-file-id' },
      ],
    })

    expect(api.sendSticker).toHaveBeenCalledTimes(1)
    expect(api.sendRichMessage).toHaveBeenCalledTimes(1)
    expect(api.sendRichMessage).toHaveBeenCalledWith(
      123,
      { markdown: 'hello there' },
      { reply_parameters: { message_id: 456 } },
      undefined,
    )
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  test('sends mention batches through plain messages', async () => {
    const api = createApi()
    api.sendMessage
      .mockResolvedValueOnce({ message_id: 1 })
      .mockResolvedValueOnce({ message_id: 2 })

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        {
          type: 'text',
          text: 'Team call @user01 @user02 @user03 @user04 @user05 @user06 @user07',
        },
      ],
    })

    expect(api.sendMessage).toHaveBeenCalledTimes(2)
    expect(api.sendMessage).toHaveBeenNthCalledWith(
      1,
      123,
      'Team call\n@user01 @user02 @user03 @user04 @user05',
      { reply_parameters: { message_id: 456 } },
    )
    expect(api.sendMessage).toHaveBeenNthCalledWith(2, 123, '@user06 @user07', {
      reply_parameters: { message_id: 1 },
    })
    expect(api.sendRichMessage).not.toHaveBeenCalled()
  })

  test('falls back to plain text when rich and MarkdownV2 delivery fail', async () => {
    const api = createApi()
    api.sendRichMessage.mockRejectedValue(new Error('rich unavailable'))
    api.sendMessage
      .mockRejectedValueOnce(new Error('markdown unavailable'))
      .mockResolvedValueOnce({ message_id: 12 })

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [{ type: 'text', text: 'hello there' }],
    })

    expect(api.sendMessage).toHaveBeenCalledTimes(2)
    expect(api.sendMessage).toHaveBeenNthCalledWith(1, 123, 'hello there', {
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: 456 },
    })
    expect(api.sendMessage).toHaveBeenNthCalledWith(2, 123, 'hello there', {
      reply_parameters: { message_id: 456 },
    })
  })

  test('does not swallow text delivery failure', async () => {
    const api = createApi()
    api.sendRichMessage.mockRejectedValue(new Error('rich unavailable'))
    api.sendMessage.mockRejectedValue(new Error('telegram unavailable'))

    await expect(
      sendResponses({
        api,
        chatId: 123,
        replyToMessageId: 456,
        responses: [{ type: 'text', text: 'hello there' }],
      }),
    ).rejects.toThrow('telegram unavailable')

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 123 }),
      'delivery.primary_failed',
    )
  })
})
