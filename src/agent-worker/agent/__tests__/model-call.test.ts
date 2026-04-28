const mockGenerateContent = jest.fn()
const mockRecordMetric = jest.fn()
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

jest.mock('@tg-bot/common', () => ({
  GEMINI_SERVICE_TIER: 'priority',
  logger: mockLogger,
  recordMetric: mockRecordMetric,
}))

jest.mock('../config', () => ({
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY_MS: 0,
}))

jest.mock('../models', () => ({
  ai: {
    models: {
      generateContent: mockGenerateContent,
    },
  },
  CHAT_MODEL: 'gemini-3.1-flash-lite-preview',
  CHAT_MODEL_FALLBACK: 'gemini-2.5-flash',
  CHAT_MODEL_TIMEOUT_MS: 20_000,
}))

import { generateWithRetry, isRetryableModelError } from '../model-call'

describe('model-call', () => {
  beforeEach(() => {
    jest.useRealTimers()
    mockGenerateContent.mockReset()
    mockRecordMetric.mockReset()
    jest.clearAllMocks()
  })

  test('falls back to stable chat model after repeated 503 errors', async () => {
    const overloadedError = Object.assign(new Error('model overloaded'), {
      status: 503,
    })
    const fallbackResponse = {
      candidates: [{ content: { parts: [{ text: 'fallback ok' }] } }],
    }

    mockGenerateContent
      .mockRejectedValueOnce(overloadedError)
      .mockRejectedValueOnce(overloadedError)
      .mockRejectedValueOnce(overloadedError)
      .mockResolvedValueOnce(fallbackResponse)

    await expect(
      generateWithRetry(
        {
          model: 'gemini-3.1-flash-lite-preview',
          contents: [],
        },
        1305082,
        'routing',
      ),
    ).resolves.toEqual(fallbackResponse)

    expect(
      mockGenerateContent.mock.calls.map(([params]) => params.model),
    ).toEqual([
      'gemini-3.1-flash-lite-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-3.1-flash-lite-preview',
      'gemini-2.5-flash',
    ])
    expect(
      mockGenerateContent.mock.calls.map(
        ([params]) => params.config?.serviceTier,
      ),
    ).toEqual(['priority', 'priority', 'priority', 'priority'])
    expect(mockRecordMetric).toHaveBeenCalledTimes(1)
    expect(mockRecordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'routing',
        model: 'gemini-2.5-flash',
        fallbackFrom: 'gemini-3.1-flash-lite-preview',
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

  test('treats 429 and 503 errors as retryable', () => {
    expect(isRetryableModelError({ status: 429 })).toBe(true)
    expect(isRetryableModelError({ status: 503 })).toBe(true)
  })
})
