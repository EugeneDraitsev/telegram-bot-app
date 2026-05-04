const mockGenerateText = jest.fn()
const mockRecordMetric = jest.fn()
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

jest.mock('@tg-bot/common', () => ({
  formatAiModelConfig: (config: { provider: string; model: string }) =>
    `${config.provider}/${config.model}`,
  getAiSdkLanguageModel: (config: { provider: string; model: string }) =>
    `${config.provider}/${config.model}`,
  logger: mockLogger,
  recordMetric: mockRecordMetric,
}))

jest.mock('../config', () => ({
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY_MS: 0,
}))

jest.mock('../models', () => ({
  CHAT_MODEL_CONFIG: { provider: 'openai', model: 'gpt-5.4-nano' },
  CHAT_MODEL_TIMEOUT_MS: 45_000,
}))

import { generateModelWithRetry, isRetryableModelError } from '../model-call'

describe('model-call', () => {
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
      .mockRejectedValueOnce(overloadedError)
      .mockResolvedValueOnce(response)

    await expect(
      generateModelWithRetry({ prompt: 'hello' }, 1305082, 'routing'),
    ).resolves.toEqual(response)

    expect(mockGenerateText).toHaveBeenCalledTimes(3)
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

  test('does not treat 400 errors as retryable', () => {
    expect(isRetryableModelError({ status: 400, message: 'bad request' })).toBe(
      false,
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
