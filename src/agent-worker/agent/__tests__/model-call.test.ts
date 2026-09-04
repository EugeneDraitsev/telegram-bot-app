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

import {
  generateModelWithRetryWithInfo,
  isRetryableModelError,
} from '../model-call'

// Callers only need the response; keep assertions focused on it.
const generateModelWithRetry = async (
  ...args: Parameters<typeof generateModelWithRetryWithInfo>
) => (await generateModelWithRetryWithInfo(...args)).response

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
      generateModelWithRetry({ prompt: 'hello' }, 1305082, 'routing', {
        provider: 'openai',
        model: 'gpt-5.4-nano',
      }),
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

  test('falls back from Luna to the previous Gemini chat model', async () => {
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
      generateModelWithRetry(
        {
          prompt: 'hello',
          providerOptions: {
            openai: {
              reasoningEffort: 'none',
              safetyIdentifier: '1305082',
              store: false,
            },
          },
        },
        1305082,
        'routing',
      ),
    ).resolves.toEqual(response)

    expect(mockGenerateText).toHaveBeenCalledTimes(4)
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        model: 'openai/gpt-5.6-luna',
        providerOptions: {
          openai: {
            reasoningEffort: 'none',
            safetyIdentifier: '1305082',
            store: false,
          },
        },
      }),
    )
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: 'openai/gpt-5.6-luna',
      }),
    )
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        model: 'google/gemini-3.6-flash',
        providerOptions: { google: { serviceTier: 'priority' } },
      }),
    )
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        model: 'google/gemini-3.6-flash',
      }),
    )
    expect(mockRecordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'routing',
        model: 'openai/gpt-5.6-luna',
        success: false,
      }),
    )
    expect(mockRecordMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'routing',
        model: 'google/gemini-3.6-flash',
        fallbackFrom: 'openai/gpt-5.6-luna',
        success: true,
      }),
    )
  })

  test('does not treat 400 errors as retryable', () => {
    expect(isRetryableModelError({ status: 400, message: 'bad request' })).toBe(
      false,
    )
  })

  test('uses an explicit role-specific fallback instead of the chat fallback', async () => {
    mockGenerateText
      .mockRejectedValueOnce(
        Object.assign(new Error('helper failed'), { status: 400 }),
      )
      .mockResolvedValueOnce({ text: '<svg />', output: [] })

    await expect(
      generateModelWithRetry(
        { prompt: 'draw' },
        1305082,
        'direct_svg',
        { provider: 'openai', model: 'gpt-5.6-luna' },
        45_000,
        { source: 'agentic' },
        {
          modelConfig: {
            provider: 'google',
            model: 'gemini-3.5-flash-lite',
          },
          reasoningEffort: 'none',
        },
      ),
    ).resolves.toEqual({ text: '<svg />', output: [] })

    expect(mockGenerateText).toHaveBeenCalledTimes(2)
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: 'google/gemini-3.5-flash-lite',
        providerOptions: { google: { serviceTier: 'priority' } },
      }),
    )
  })

  test('records explicit commands separately from agentic traffic', async () => {
    mockGenerateText.mockResolvedValue({ text: 'ok', output: [] })

    await generateModelWithRetry(
      { prompt: 'hello' },
      1305082,
      'routing',
      { provider: 'openai', model: 'gpt-5.4-nano' },
      45_000,
      { source: 'command', command: 'o' },
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
