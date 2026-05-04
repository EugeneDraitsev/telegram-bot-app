import type { GenerateContentResponse } from '@google/genai'
import type { Message } from 'telegram-typings'

import { geminiModels } from '../models'
import { shouldEngageWithMessage } from '../reply-gate'

const OUR_BOT = { id: 123456, username: 'testbot' }
const mockGenerateContent = jest.spyOn(geminiModels, 'generateContent')
const geminiResponse = (text: string) => ({ text }) as GenerateContentResponse

describe('shouldEngageWithMessage', () => {
  beforeEach(() => {
    mockGenerateContent.mockReset()
    mockGenerateContent.mockResolvedValue(geminiResponse('ignore'))
  })

  afterAll(() => {
    mockGenerateContent.mockRestore()
  })

  test('returns false for empty message without media', async () => {
    const message = { text: '' } as Message

    expect(
      await shouldEngageWithMessage({
        message,
        textContent: '',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).toEqual(false)
  })

  test('returns false for mention of another account', async () => {
    const message = { text: '@otherbot can you help?' } as Message

    expect(
      await shouldEngageWithMessage({
        message,
        textContent: '@otherbot can you help?',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).toEqual(false)
  })

  test('lets Gemini gate decide for non-addressed standalone requests', async () => {
    const message = { text: 'can you help?' } as Message

    expect(
      await shouldEngageWithMessage({
        message,
        textContent: 'can you help?',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).toEqual(false)

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: 'can you help?',
      }),
    )
  })

  test('can engage with standalone questions without bot address words', async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiResponse('engage'))

    const text = 'какой курс биткоина ща челик?'
    const message = {
      text,
      chat: { id: 1305082, type: 'group' },
      from: { id: 1305082 },
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: text,
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(true)

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: text,
        config: expect.objectContaining({
          systemInstruction: expect.stringContaining(
            'standalone current question/request',
          ),
        }),
      }),
    )
  })

  test('returns false for reply to another bot without our mention', async () => {
    const message = {
      text: 'some text',
      reply_to_message: { from: { is_bot: true, id: 999999 } },
    } as Message

    expect(
      await shouldEngageWithMessage({
        message,
        textContent: 'some text',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).toEqual(false)
  })

  test('returns false when reply to our bot addresses another account', async () => {
    const message = {
      text: '@otheruser rank',
      reply_to_message: {
        from: { is_bot: true, id: OUR_BOT.id },
      },
    } as Message

    expect(
      await shouldEngageWithMessage({
        message,
        textContent: '@otheruser rank',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).toEqual(false)

    expect(mockGenerateContent).not.toHaveBeenCalled()
  })

  test('lets reply gate model ignore low-signal reaction reply to our bot', async () => {
    const reactionText = '\u0430\u0445\u0445\u0430'
    const message = {
      text: reactionText,
      chat: { id: 777 },
      reply_to_message: {
        from: { is_bot: true, id: OUR_BOT.id },
        text: 'previous bot answer',
      },
    } as Message

    expect(
      await shouldEngageWithMessage({
        message,
        textContent: reactionText,
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).toEqual(false)

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: expect.stringContaining(`Current message: ${reactionText}`),
        config: expect.objectContaining({
          systemInstruction: expect.stringContaining(
            'Treat reply-to-THIS-bot as weak context only',
          ),
        }),
      }),
    )
  })

  test('uses Gemini model for reply to our bot with response intent', async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiResponse('engage'))

    const questionText = '\u043f\u043e\u0447\u0435\u043c\u0443?'
    const message = {
      text: questionText,
      chat: { id: 777 },
      reply_to_message: {
        from: { is_bot: true, id: OUR_BOT.id },
        text: 'previous bot answer',
      },
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: questionText,
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(true)

    expect(mockGenerateContent).toHaveBeenCalled()
  })

  test('uses Gemini model when reply mentions another account and the bot', async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiResponse('engage'))

    const message = {
      text: '@otheruser rank and bot too',
      chat: { id: 777 },
      reply_to_message: {
        from: { is_bot: true, id: OUR_BOT.id },
      },
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: '@otheruser rank and bot too',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(true)

    expect(mockGenerateContent).toHaveBeenCalled()
  })

  test('uses Gemini model for addressed reply gate decisions', async () => {
    mockGenerateContent.mockResolvedValueOnce(geminiResponse('engage'))

    const message = {
      text: 'бот что тут в кратце ИМЕННО в этом сообщении',
      chat: { id: 777 },
      reply_to_message: { message_id: 55, text: 'article text to summarize' },
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: 'бот что тут в кратце ИМЕННО в этом сообщении',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(true)

    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gemini-3.1-flash-lite-preview',
        contents: expect.stringContaining(
          'Replied-to message: article text to summarize',
        ),
        config: expect.objectContaining({
          httpOptions: { timeout: 16_000, retryOptions: { attempts: 1 } },
          temperature: 0,
        }),
      }),
    )
  })
})
