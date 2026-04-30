import type {
  Response as OpenAiResponse,
  ResponseCreateParamsNonStreaming,
} from 'openai/resources/responses/responses'

import { logger, type MetricStatus, recordMetric } from '@tg-bot/common'
import { getOpenAiClient } from '../services/openai-client'
import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from './config'
import { CHAT_MODEL, CHAT_MODEL_TIMEOUT_MS } from './models'
import { withTimeout } from './utils'

export class ModelCallTimeoutError extends Error {
  constructor(
    readonly model: string,
    readonly timeoutMs: number,
  ) {
    super(`Model ${model} timed out after ${timeoutMs}ms`)
    this.name = 'ModelCallTimeoutError'
  }
}

export function isRetryableModelError(error: unknown): boolean {
  const status = (error as { status?: number })?.status
  return (
    status === 408 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500)
  )
}

function getModelErrorStatus(error: unknown): MetricStatus {
  return error instanceof ModelCallTimeoutError ? 'timeout' : 'error'
}

async function generateSingleModelWithRetry(
  params: ResponseCreateParamsNonStreaming,
  chatId: number,
): Promise<OpenAiResponse> {
  let lastError: unknown
  const model = typeof params.model === 'string' ? params.model : CHAT_MODEL

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const promise = getOpenAiClient().responses.create(
        {
          ...params,
          model,
          store: params.store ?? false,
        },
        {
          timeout: CHAT_MODEL_TIMEOUT_MS + 1_000,
          maxRetries: 0,
        },
      )
      return await withTimeout(
        promise,
        CHAT_MODEL_TIMEOUT_MS,
        new ModelCallTimeoutError(model, CHAT_MODEL_TIMEOUT_MS),
      )
    } catch (error) {
      lastError = error
      const isTimeout = error instanceof ModelCallTimeoutError
      const isRetryable = !isTimeout && isRetryableModelError(error)

      if (!isRetryable || attempt === MAX_RETRIES) {
        if (isTimeout) {
          logger.error(
            { chatId, model, timeoutMs: CHAT_MODEL_TIMEOUT_MS },
            'model.failed_timeout',
          )
        }
        throw error
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      logger.warn(
        {
          chatId,
          model,
          attempt: attempt + 1,
          status: (error as { status?: number })?.status,
          delayMs: delay,
        },
        'model.retry',
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export async function generateWithRetry(
  params: ResponseCreateParamsNonStreaming,
  chatId: number,
  metricName: string,
): Promise<OpenAiResponse> {
  const primaryModel =
    typeof params.model === 'string' ? params.model : undefined
  const startedAt = Date.now()

  logger.info(
    {
      chatId,
      name: metricName,
      model: primaryModel,
      timeoutMs: CHAT_MODEL_TIMEOUT_MS,
    },
    'model.call_start',
  )

  const track = (model?: string, status: MetricStatus = 'success') => {
    void recordMetric({
      type: 'model_call',
      source: 'agentic',
      name: metricName,
      model,
      chatId,
      durationMs: Date.now() - startedAt,
      success: status === 'success',
      status,
      timestamp: Date.now(),
    })
  }

  try {
    const response = await generateSingleModelWithRetry(params, chatId)
    track(primaryModel)
    return response
  } catch (error) {
    track(primaryModel, getModelErrorStatus(error))
    throw error
  }
}
