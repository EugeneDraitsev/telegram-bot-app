const mockResponsesCreate = jest.fn()
const mockRecordMetric = jest.fn()
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    responses: {
      create: mockResponsesCreate,
    },
  })),
}))

jest.mock('@tg-bot/common', () => ({
  logger: mockLogger,
  recordMetric: mockRecordMetric,
}))

jest.mock('../config', () => ({
  MAX_RETRIES: 2,
  RETRY_BASE_DELAY_MS: 0,
}))

jest.mock('../models', () => ({
  CHAT_MODEL: 'gpt-5.4-nano',
  CHAT_MODEL_TIMEOUT_MS: 45_000,
}))

import { resetOpenAiClientForTests } from '../../services/openai-client'
import { generateWithRetry, isRetryableModelError } from '../model-call'

describe('model-call', () => {
  beforeAll(() => {
    process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test-key'
  })

  beforeEach(() => {
    jest.useRealTimers()
    resetOpenAiClientForTests()
    mockResponsesCreate.mockReset()
    mockRecordMetric.mockReset()
    jest.clearAllMocks()
  })

  test('retries retryable OpenAI response errors', async () => {
    const overloadedError = Object.assign(new Error('model overloaded'), {
      status: 503,
    })
    const response = { output_text: 'ok', output: [] }

    mockResponsesCreate
      .mockRejectedValueOnce(overloadedError)
      .mockRejectedValueOnce(overloadedError)
      .mockResolvedValueOnce(response)

    await expect(
      generateWithRetry(
        {
          model: 'gpt-5.4-nano',
          input: 'hello',
        },
        1305082,
        'routing',
      ),
    ).resolves.toEqual(response)

    expect(mockResponsesCreate).toHaveBeenCalledTimes(3)
    expect(
      mockResponsesCreate.mock.calls.map(([params]) => params.model),
    ).toEqual(['gpt-5.4-nano', 'gpt-5.4-nano', 'gpt-5.4-nano'])
    expect(mockResponsesCreate.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        model: 'gpt-5.4-nano',
        store: false,
      }),
    )
    expect(mockResponsesCreate.mock.calls[0]?.[1]).toEqual({
      timeout: 46_000,
      maxRetries: 0,
    })
    expect(mockRecordMetric).toHaveBeenCalledTimes(1)
    expect(mockRecordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'routing',
        model: 'gpt-5.4-nano',
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
  })

  test('does not retry conflict errors', () => {
    expect(isRetryableModelError({ status: 409 })).toBe(false)
  })
})
