import type { GenerateContentResponse } from '@google/genai'

import { type MetricStatus, recordMetric } from '@tg-bot/common'
import { logger } from '../logger'
import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from './config'
import {
  ai,
  CHAT_MODEL,
  CHAT_MODEL_FALLBACK,
  CHAT_MODEL_TIMEOUT_MS,
} from './models'
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
  return status === 429 || status === 503
}

function getModelErrorStatus(error: unknown): MetricStatus {
  return error instanceof ModelCallTimeoutError ? 'timeout' : 'error'
}

async function generateSingleModelWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  chatId: number,
): Promise<GenerateContentResponse> {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const promise = ai.models.generateContent(params)
      return await (params.model === CHAT_MODEL
        ? withTimeout(
            promise,
            CHAT_MODEL_TIMEOUT_MS,
            new ModelCallTimeoutError(
              params.model as string,
              CHAT_MODEL_TIMEOUT_MS,
            ),
          )
        : promise)
    } catch (error) {
      lastError = error
      const isTimeout = error instanceof ModelCallTimeoutError
      const isRetryable = !isTimeout && isRetryableModelError(error)

      if (!isRetryable || attempt === MAX_RETRIES) {
        if (isTimeout) {
          logger.error(
            { chatId, model: params.model, timeoutMs: CHAT_MODEL_TIMEOUT_MS },
            'model.failed_timeout_over_20s',
          )
        }
        throw error
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      logger.warn(
        {
          chatId,
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
  params: Parameters<typeof ai.models.generateContent>[0],
  chatId: number,
  metricName: string,
): Promise<GenerateContentResponse> {
  const primaryModel =
    typeof params.model === 'string' ? params.model : undefined
  const fallbackModel: string = CHAT_MODEL_FALLBACK
  const canFallback =
    primaryModel === CHAT_MODEL && fallbackModel !== primaryModel
  const startedAt = Date.now()

  const track = (
    model?: string,
    fallbackFrom?: string,
    status: MetricStatus = 'success',
  ) => {
    void recordMetric({
      type: 'model_call',
      source: 'agentic',
      name: metricName,
      model,
      fallbackFrom,
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
  } catch (primaryError) {
    const isTransient =
      primaryError instanceof ModelCallTimeoutError ||
      isRetryableModelError(primaryError)

    if (!canFallback || !isTransient) {
      track(primaryModel, undefined, getModelErrorStatus(primaryError))
      throw primaryError
    }

    logger.warn(
      { chatId, model: primaryModel, fallbackModel },
      'model.primary_fallback',
    )

    try {
      const response = await generateSingleModelWithRetry(
        { ...params, model: fallbackModel },
        chatId,
      )
      track(fallbackModel, primaryModel)
      return response
    } catch (fallbackError) {
      track(fallbackModel, primaryModel, getModelErrorStatus(fallbackError))
      throw fallbackError
    }
  }
}
