import * as common from '@tg-bot/common'

const mockGenerateText = jest.fn()
const mockRecordMetric = jest
  .spyOn(common, 'recordMetric')
  .mockResolvedValue(undefined)

jest
  .spyOn(common, 'getAiSdkLanguageModel')
  .mockImplementation(
    (config) =>
      `${config.provider}/${config.model}` as unknown as ReturnType<
        typeof common.getAiSdkLanguageModel
      >,
  )

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

jest.mock('../config', () => ({
  MAX_RETRIES: 1,
  RETRY_BASE_DELAY_MS: 0,
}))

import { generateModelWithRetry, isRetryableModelError } from '../model-call'
import { CHAT_ROLE, getModelProviderOptions } from '../models'

// Callers only need the response; keep assertions focused on it.
const generate = async (...args: Parameters<typeof generateModelWithRetry>) =>
  (await generateModelWithRetry(...args)).response

const nano = {
  config: { provider: 'openai' as const, model: 'gpt-5.4-nano' },
  reasoningEffort: 'none' as const,
  label: 'openai/gpt-5.4-nano',
}

describe('model-call', () => {
  afterAll(() => {
    jest.restoreAllMocks()
  })

  beforeEach(() => {
    jest.useRealTimers()
    mockGenerateText.mockReset()
    mockRecordMetric.mockReset()
    jest.clearAllMocks()
  })

  test('retries retryable AI SDK generation errors', async () => {
    const overloadedError = Object.assign(new Error('model overloaded'), {
      status: 503,
    })
    const response = { text: 'ok', output: [] }

    mockGenerateText
      .mockRejectedValueOnce(overloadedError)
      .mockResolvedValueOnce(response)

    await expect(
      generate(
        { prompt: 'hello' },
        {
          chatId: 1305082,
          metricName: 'routing',
          choice: nano,
          timeoutMs: 45_000,
        },
      ),
    ).resolves.toEqual(response)

    expect(mockGenerateText).toHaveBeenCalledTimes(2)
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-5.4-nano',
        prompt: 'hello',
        maxRetries: 0,
        timeout: 46_000,
      }),
    )
    expect(mockRecordMetric).toHaveBeenCalledTimes(1)
    expect(mockRecordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'routing',
        model: 'openai/gpt-5.4-nano',
        success: true,
        status: 'success',
      }),
    )
  })

  test('falls back from the chat model to its Gemini fallback', async () => {
    const overloadedError = Object.assign(new Error('model overloaded'), {
      status: 503,
    })
    const fallbackThrottle = Object.assign(new Error('fallback busy'), {
      status: 429,
    })
    const response = { text: 'ok from fallback', output: [] }

    mockGenerateText
      .mockRejectedValueOnce(overloadedError)
      .mockRejectedValueOnce(overloadedError)
      .mockRejectedValueOnce(fallbackThrottle)
      .mockResolvedValueOnce(response)

    await expect(
      generate(
        { prompt: 'hello' },
        {
          chatId: 1305082,
          metricName: 'routing',
          choice: CHAT_ROLE.primary,
          fallback: CHAT_ROLE.fallback,
          timeoutMs: CHAT_ROLE.timeoutMs,
        },
      ),
    ).resolves.toEqual(response)

    expect(mockGenerateText).toHaveBeenCalledTimes(4)
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: 'openai/gpt-6-astra',
        providerOptions: getModelProviderOptions(CHAT_ROLE.primary, {
          chatId: 1305082,
        }),
      }),
    )
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ model: 'openai/gpt-6-astra' }),
    )
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        model: 'google/gemini-3.8-flash',
        providerOptions: getModelProviderOptions(CHAT_ROLE.fallback, {
          chatId: 1305082,
        }),
      }),
    )
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({ model: 'google/gemini-3.8-flash' }),
    )
    expect(mockRecordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'routing',
        model: 'openai/gpt-6-astra',
        success: false,
      }),
    )
    expect(mockRecordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'routing',
        model: 'google/gemini-3.8-flash',
        fallbackFrom: 'openai/gpt-6-astra',
        success: true,
      }),
    )
  })

  test('does not treat 400 errors as retryable', () => {
    expect(isRetryableModelError({ status: 400, message: 'bad request' })).toBe(
      false,
    )
  })

  test('fails without retrying when no fallback is configured', async () => {
    mockGenerateText.mockRejectedValue(
      Object.assign(new Error('helper failed'), { status: 400 }),
    )

    await expect(
      generate(
        { prompt: 'draw' },
        {
          chatId: 1305082,
          metricName: 'direct_svg',
          choice: CHAT_ROLE.primary,
          timeoutMs: CHAT_ROLE.timeoutMs,
        },
      ),
    ).rejects.toThrow('helper failed')

    expect(mockGenerateText).toHaveBeenCalledTimes(1)
  })

  test('records explicit commands separately from agentic traffic', async () => {
    mockGenerateText.mockResolvedValue({ text: 'ok', output: [] })

    await generate(
      { prompt: 'hello' },
      {
        chatId: 1305082,
        metricName: 'routing',
        choice: nano,
        timeoutMs: 45_000,
        attribution: { source: 'command', command: 'o' },
      },
    )

    expect(mockRecordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'command',
        command: 'o',
        name: 'routing',
      }),
    )
  })

  test('treats transient errors as retryable', () => {
    expect(isRetryableModelError({ status: 408 })).toBe(true)
    expect(isRetryableModelError({ status: 429 })).toBe(true)
    expect(isRetryableModelError({ status: 503 })).toBe(true)
    expect(isRetryableModelError({ statusCode: 503 })).toBe(true)
  })

  test('does not retry conflict errors', () => {
    expect(isRetryableModelError({ status: 409 })).toBe(false)
  })
})
