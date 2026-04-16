const mockSaveBotReplyToHistory = jest.fn()
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

jest.mock('@tg-bot/common', () => ({
  cleanGeminiMessage: (text: string) => text,
  formatTelegramMarkdownV2: (text: string) => text,
  logger: mockLogger,
  saveBotReplyToHistory: mockSaveBotReplyToHistory,
}))

import type { TelegramApi } from '../../types'
import { sendResponses } from '../delivery'

function createApi(): TelegramApi & {
  sendMessage: jest.Mock
  sendPhoto: jest.Mock
  sendVoice: jest.Mock
  sendVideo: jest.Mock
  sendAnimation: jest.Mock
  sendSticker: jest.Mock
  sendDice: jest.Mock
  sendChatAction: jest.Mock
} {
  return {
    getFile: jest.fn(),
    sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
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
    mockSaveBotReplyToHistory.mockReset()
    mockSaveBotReplyToHistory.mockResolvedValue(undefined)
    jest.clearAllMocks()
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
        { type: 'dice', emoji: '🎲' },
        { type: 'voice', buffer: Buffer.from('voice') },
      ],
    })

    expect(api.sendDice).toHaveBeenCalledTimes(1)
    expect(api.sendDice).toHaveBeenCalledWith(123, '🎲', {
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
    expect(api.sendMessage).toHaveBeenCalledTimes(1)
    expect(api.sendMessage).toHaveBeenCalledWith(
      123,
      'hello there',
      expect.objectContaining({
        parse_mode: 'MarkdownV2',
        reply_parameters: { message_id: 456 },
      }),
    )
  })

  test('splits texts with more than five mentions into follow-up messages', async () => {
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
          text: 'ВАЛОРАНТЫ ОБЩИЙ СБОР @user01 @user02 @user03 @user04 @user05 @user06 @user07',
        },
      ],
    })

    expect(api.sendMessage).toHaveBeenCalledTimes(2)
    expect(api.sendMessage).toHaveBeenNthCalledWith(
      1,
      123,
      'ВАЛОРАНТЫ ОБЩИЙ СБОР\n@user01 @user02 @user03 @user04 @user05',
      expect.objectContaining({
        parse_mode: 'MarkdownV2',
        reply_parameters: { message_id: 456 },
      }),
    )
    expect(api.sendMessage).toHaveBeenNthCalledWith(
      2,
      123,
      '@user06 @user07',
      expect.objectContaining({
        parse_mode: 'MarkdownV2',
        reply_parameters: { message_id: 1 },
      }),
    )
  })
})
