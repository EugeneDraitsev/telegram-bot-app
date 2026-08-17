import type { TelegramApi } from '../../types'

type TestTelegramApi = TelegramApi & {
  sendMessage: jest.Mock
  sendPhoto: jest.Mock
  sendAudio: jest.Mock
  sendDocument: jest.Mock
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
  isTelegramReplyTargetMissingError: (error: unknown) => {
    const candidate = error as { error_code?: unknown; description?: unknown }
    return (
      candidate?.error_code === 400 &&
      typeof candidate.description === 'string' &&
      candidate.description.includes('message to be replied not found')
    )
  },
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
    sendAudio: jest.fn().mockResolvedValue({ message_id: 9 }),
    sendDocument: jest.fn().mockResolvedValue({ message_id: 10 }),
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

  test('uploads generated video buffers through Telegram', async () => {
    const api = createApi()

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        {
          type: 'video',
          buffer: Buffer.from('video'),
          mimeType: 'video/webm',
          fileName: 'omni.mp4',
          caption: 'Omni with audio',
        },
        { type: 'text', text: 'Generic generation status' },
      ],
    })

    expect(api.sendVideo).toHaveBeenCalledTimes(1)
    expect(api.sendVideo).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ filename: 'omni.webm' }),
      {
        caption: 'Omni with audio',
        parse_mode: 'MarkdownV2',
        supports_streaming: true,
        reply_parameters: { message_id: 456 },
      },
    )
    expect(api.sendMessage).not.toHaveBeenCalled()
  })

  test('uploads generated music as voice and sends requested lyrics separately', async () => {
    const api = createApi()

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        {
          type: 'audio',
          buffer: Buffer.from('music'),
          mimeType: 'audio/mpeg',
          fileName: 'lyria.mp3',
          title: 'Midnight Cats',
          caption: 'An emo song about two cats',
        },
        { type: 'text', text: '[Verse]\nhello' },
      ],
    })

    expect(api.sendVoice).toHaveBeenCalledTimes(1)
    expect(api.sendVoice).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ filename: 'lyria.mp3' }),
      {
        caption: 'Midnight Cats\nAn emo song about two cats',
        parse_mode: 'MarkdownV2',
        reply_parameters: { message_id: 456 },
      },
    )
    expect(api.sendAudio).not.toHaveBeenCalled()
    expect(api.sendDocument).not.toHaveBeenCalled()
    expect(api.sendRichMessage).toHaveBeenCalledWith(
      123,
      { markdown: '[Verse]\nhello' },
      { reply_parameters: { message_id: 3 } },
      undefined,
    )
  })

  test('falls back to audio when Telegram forbids voice messages', async () => {
    const api = createApi()
    const voiceError = Object.assign(new Error('voice forbidden'), {
      error_code: 403,
      description: 'Forbidden: VOICE_MESSAGES_FORBIDDEN',
    })
    api.sendVoice.mockRejectedValueOnce(voiceError)

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        {
          type: 'audio',
          buffer: Buffer.from('music'),
          fileName: 'lyria.mp3',
          title: 'Midnight Cats',
          caption: 'An emo song about two cats',
        },
        { type: 'text', text: '[Verse]\nhello' },
      ],
    })

    expect(api.sendAudio).toHaveBeenCalledTimes(1)
    expect(api.sendAudio).toHaveBeenCalledWith(123, expect.anything(), {
      title: 'Midnight Cats',
      caption: 'An emo song about two cats',
      parse_mode: 'MarkdownV2',
      reply_parameters: { message_id: 456 },
    })
    expect(api.sendRichMessage).toHaveBeenCalledWith(
      123,
      { markdown: '[Verse]\nhello' },
      { reply_parameters: { message_id: 9 } },
      undefined,
    )
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { chatId: 123, error: voiceError },
      'delivery.voice_forbidden_fallback',
    )
  })

  test('falls back to audio after any voice delivery error', async () => {
    const api = createApi()
    const voiceError = new Error('voice upload failed')
    api.sendVoice.mockRejectedValueOnce(voiceError)

    await sendResponses({
      api,
      chatId: 123,
      responses: [
        {
          type: 'audio',
          buffer: Buffer.from('music'),
          mimeType: 'audio/mpeg',
          title: 'Night Run',
        },
      ],
    })

    expect(api.sendAudio).toHaveBeenCalledTimes(1)
    expect(api.sendDocument).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { chatId: 123, error: voiceError },
      'delivery.voice_failed_fallback',
    )
  })

  test('sends formats unsupported by Telegram players as documents', async () => {
    const api = createApi()

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 456,
      responses: [
        {
          type: 'audio',
          buffer: Buffer.from('music'),
          mimeType: 'audio/wav',
          fileName: 'lyria.mp3',
          title: 'Night Run',
          caption: 'A cinematic track',
        },
      ],
    })

    expect(api.sendVoice).not.toHaveBeenCalled()
    expect(api.sendAudio).not.toHaveBeenCalled()
    expect(api.sendDocument).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ filename: 'lyria.wav' }),
      {
        caption: 'Night Run\nA cinematic track',
        parse_mode: 'MarkdownV2',
        reply_parameters: { message_id: 456 },
      },
    )
  })

  test('preserves paid audio as a document when both players reject it', async () => {
    const api = createApi()
    const audioError = new Error('audio upload failed')
    api.sendVoice.mockRejectedValueOnce(new Error('voice upload failed'))
    api.sendAudio.mockRejectedValueOnce(audioError)

    await sendResponses({
      api,
      chatId: 123,
      responses: [
        {
          type: 'audio',
          buffer: Buffer.from('music'),
          mimeType: 'audio/mpeg',
          title: 'Night Run',
        },
      ],
    })

    expect(api.sendDocument).toHaveBeenCalledTimes(1)
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { chatId: 123, error: audioError, mimeType: 'audio/mpeg' },
      'delivery.audio_failed_document_fallback',
    )
  })

  test('warns when only the highest-priority generated media can be sent', async () => {
    const api = createApi()

    await sendResponses({
      api,
      chatId: 123,
      responses: [
        { type: 'image', url: 'https://example.com/image.png' },
        { type: 'audio', buffer: Buffer.from('music') },
      ],
    })

    expect(api.sendPhoto).toHaveBeenCalledTimes(1)
    expect(api.sendVoice).not.toHaveBeenCalled()
    expect(api.sendAudio).not.toHaveBeenCalled()
    expect(api.sendDocument).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      {
        chatId: 123,
        deliveredResponseType: 'image',
        droppedResponseTypes: ['audio'],
      },
      'delivery.media_dropped',
    )
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

  test('retries without reply parameters when the reply target is missing', async () => {
    const api = createApi()
    const missingReplyError = Object.assign(new Error('missing reply'), {
      error_code: 400,
      description: 'Bad Request: message to be replied not found',
    })
    api.sendRichMessage
      .mockRejectedValueOnce(missingReplyError)
      .mockResolvedValueOnce({ message_id: 13 })
    api.sendMessage.mockRejectedValue(missingReplyError)

    await sendResponses({
      api,
      chatId: 123,
      replyToMessageId: 900001,
      responses: [{ type: 'text', text: 'hello there' }],
    })

    expect(api.sendRichMessage).toHaveBeenCalledTimes(2)
    expect(api.sendRichMessage).toHaveBeenNthCalledWith(
      1,
      123,
      { markdown: 'hello there' },
      { reply_parameters: { message_id: 900001 } },
      undefined,
    )
    expect(api.sendRichMessage).toHaveBeenNthCalledWith(
      2,
      123,
      { markdown: 'hello there' },
      {},
      undefined,
    )
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { chatId: 123, replyToMessageId: 900001 },
      'delivery.reply_target_missing',
    )
    expect(mockSaveBotReplyToHistory).toHaveBeenCalledWith({ message_id: 13 })
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
