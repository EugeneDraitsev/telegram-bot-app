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

  test('lets structured reply gate decide for non-addressed standalone requests', async () => {
    const message = { text: 'can you help?' } as Message

    expect(
      await shouldEngageWithMessage({
        message,
        textContent: 'can you help?',
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).toEqual(false)

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'can you help?',
        output: expect.objectContaining({ name: 'object' }),
      }),
    )
  })

  test('can engage with standalone questions without bot address words', async () => {
    mockGenerateText.mockResolvedValueOnce(aiSdkResponse('engage'))

    const text = 'ÐºÐ°ÐºÐ¾Ð¹ ÐºÑƒÑ€Ñ Ð±Ð¸Ñ‚ÐºÐ¾Ð¸Ð½Ð° Ñ‰Ð° Ñ‡ÐµÐ»Ð¸Ðº?'
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

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: text,
        system: expect.stringContaining('standalone current question/request'),
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

    const message = {
      text: 'Ð±Ð¾Ñ‚ Ñ‡Ñ‚Ð¾ Ñ‚ÑƒÑ‚ Ð² ÐºÑ€Ð°Ñ‚Ñ†Ðµ Ð˜ÐœÐ•ÐÐÐž Ð² ÑÑ‚Ð¾Ð¼ ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ð¸',
      chat: { id: 777 },
      reply_to_message: { message_id: 55, text: 'article text to summarize' },
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent:
          'Ð±Ð¾Ñ‚ Ñ‡Ñ‚Ð¾ Ñ‚ÑƒÑ‚ Ð² ÐºÑ€Ð°Ñ‚Ñ†Ðµ Ð˜ÐœÐ•ÐÐÐž Ð² ÑÑ‚Ð¾Ð¼ ÑÐ¾Ð¾Ð±Ñ‰ÐµÐ½Ð¸Ð¸',
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
