import type { Message } from 'telegram-typings'

const mockResponsesCreate = jest.fn()

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: {
      create: mockResponsesCreate,
    },
  })),
}))

import { resetOpenAiClientForTests } from '../../services/openai-client'
import { shouldEngageWithMessage } from '../reply-gate'

const OUR_BOT = { id: 123456, username: 'testbot' }

describe('shouldEngageWithMessage', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'
  })

  beforeEach(() => {
    resetOpenAiClientForTests()
    mockResponsesCreate.mockReset()
    mockResponsesCreate.mockResolvedValue({
      output: [{ type: 'function_call', name: 'ignore', arguments: '{}' }],
    })
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

  test('uses OpenAI model for addressed reply gate decisions', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      output: [{ type: 'function_call', name: 'engage', arguments: '{}' }],
    })

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

    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4-nano',
        input: expect.stringContaining(
          'Replied-to message: article text to summarize',
        ),
        reasoning: { effort: 'low' },
        tool_choice: 'required',
        safety_identifier: '777',
      }),
      { timeout: 16_000, maxRetries: 0 },
    )
  })
})
