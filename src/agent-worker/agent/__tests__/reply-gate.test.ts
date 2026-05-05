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
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'
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
    ).resolves.toBe(false)

    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  test('does not engage with standalone project planning chat messages', async () => {
    const text =
      'я хочу снять видос как заставка сериала друзья, где мы все бежим и по очереди садимся на диван'

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
    const reactionText = 'ахха'
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

    const questionText = 'почему?'
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

  test('uses fallback model on reply gate failure for bot-addressed messages', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('reply gate timeout'))
    mockGenerateText.mockResolvedValueOnce(aiSdkResponse('engage'))

    const text = 'бот кто такой плешивый пыня?'

    await expect(
      shouldEngageWithMessage({
        message: { text, chat: { id: 1305082 } } as Message,
        textContent: text,
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(true)

    expect(mockGenerateText).toHaveBeenCalledTimes(2)
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
            serviceTier: 'priority',
            store: false,
          },
        },
      }),
    )
  })

  test('does not fail open for reply-only reactions', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('reply gate timeout'))

    const text = 'ахха'
    const message = {
      text,
      chat: { id: 777 },
      reply_to_message: {
        from: { is_bot: true, id: OUR_BOT.id },
        text: 'previous bot answer',
      },
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: text,
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(false)

    expect(mockGenerateText).toHaveBeenCalledTimes(2)
  })

  test('fails closed when both reply gate models fail', async () => {
    mockGenerateText.mockRejectedValueOnce(new Error('reply gate timeout'))
    mockGenerateText.mockRejectedValueOnce(new Error('fallback timeout'))

    const text = 'бот кто такой плешивый пыня?'

    await expect(
      shouldEngageWithMessage({
        message: { text, chat: { id: 1305082 } } as Message,
        textContent: text,
        hasMedia: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toBe(false)

    expect(mockGenerateText).toHaveBeenCalledTimes(2)
  })

  test('uses AI SDK structured output for addressed reply gate decisions', async () => {
    mockGenerateText.mockResolvedValueOnce(aiSdkResponse('engage'))

    const text = 'бот что тут в кратце ИМЕННО в этом сообщении'
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
        output: expect.anything(),
        temperature: 0,
        timeout: 15_000,
        maxRetries: 0,
      }),
    )
  })
})
