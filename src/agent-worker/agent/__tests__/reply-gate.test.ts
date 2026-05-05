import type { Message } from 'telegram-typings'

const mockGenerateText = jest.fn()

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  Output: {
    object: (config: unknown) => config,
  },
}))

import { shouldEngageWithMessage } from '../reply-gate'

const OUR_BOT = { id: 123456, username: 'testbot' }
const aiSdkResponse = (decision: 'engage' | 'ignore') => ({
  output: { decision },
})

describe('shouldEngageWithMessage', () => {
  beforeAll(() => {
    process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'test-key'
  })

  beforeEach(() => {
    mockGenerateText.mockReset()
    mockGenerateText.mockResolvedValue(aiSdkResponse('ignore'))
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

  test('returns false for non-addressed request', async () => {
    const message = { text: 'can you help?' } as Message

    expect(
      await shouldEngageWithMessage({
        message,
        textContent: 'can you help?',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).toEqual(false)

    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  test('does not engage with standalone questions without bot address words', async () => {
    mockGenerateText.mockResolvedValueOnce(aiSdkResponse('engage'))

    const text =
      '\u043a\u0430\u043a\u043e\u0439 \u043a\u0443\u0440\u0441 \u0431\u0438\u0442\u043a\u043e\u0438\u043d\u0430 \u0449\u0430 \u0447\u0435\u043b\u0438\u043a?'
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
    ).resolves.toBe(false)

    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  test('does not engage with standalone project planning chat messages', async () => {
    const text =
      '\u044f \u0445\u043e\u0447\u0443 \u0441\u043d\u044f\u0442\u044c \u0432\u0438\u0434\u043e\u0441 \u043a\u0430\u043a \u0437\u0430\u0441\u0442\u0430\u0432\u043a\u0430 \u0441\u0435\u0440\u0438\u0430\u043b\u0430 \u0434\u0440\u0443\u0437\u044c\u044f, \u0433\u0434\u0435 \u043c\u044b \u0432\u0441\u0435 \u0431\u0435\u0436\u0438\u043c \u0438 \u043f\u043e \u043e\u0447\u0435\u0440\u0435\u0434\u0438 \u0441\u0430\u0434\u0438\u043c\u0441\u044f \u043d\u0430 \u0434\u0438\u0432\u0430\u043d'

    await expect(
      shouldEngageWithMessage({
        message: { text, chat: { id: 777 } } as Message,
        textContent: text,
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(false)

    expect(mockGenerateText).not.toHaveBeenCalled()
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

    expect(mockGenerateText).not.toHaveBeenCalled()
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

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(`Current message: ${reactionText}`),
        system: expect.stringContaining(
          'Treat reply-to-THIS-bot as weak context only',
        ),
      }),
    )
  })

  test('uses structured reply gate for reply to our bot with response intent', async () => {
    mockGenerateText.mockResolvedValueOnce(aiSdkResponse('engage'))

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

    expect(mockGenerateText).toHaveBeenCalled()
  })

  test('uses structured reply gate when reply mentions another account and the bot', async () => {
    mockGenerateText.mockResolvedValueOnce(aiSdkResponse('engage'))

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

    expect(mockGenerateText).toHaveBeenCalled()
  })

  test('uses AI SDK structured output for addressed reply gate decisions', async () => {
    mockGenerateText.mockResolvedValueOnce(aiSdkResponse('engage'))

    const text =
      '\u0431\u043e\u0442 \u0447\u0442\u043e \u0442\u0443\u0442 \u0432 \u043a\u0440\u0430\u0442\u0446\u0435 \u0418\u041c\u0415\u041d\u041d\u041e \u0432 \u044d\u0442\u043e\u043c \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0438'
    const message = {
      text,
      chat: { id: 777 },
      reply_to_message: { message_id: 55, text: 'article text to summarize' },
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: text,
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(true)

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'Replied-to message: article text to summarize',
        ),
        system: expect.stringContaining(
          'Return exactly one structured decision',
        ),
        temperature: 0,
        timeout: 15_000,
        maxRetries: 0,
      }),
    )
  })
})
