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

export class ModelCallTimeoutError extends Error {
  constructor(
    readonly model: string,
    readonly timeoutMs: number,
  ) {
    super(`Model ${model} timed out after ${timeoutMs}ms`)
    this.name = 'ModelCallTimeoutError'
  }
}

function resolveModelName(
  params: Parameters<typeof ai.models.generateContent>[0],
): string | undefined {
  return typeof params.model === 'string' ? params.model : undefined
}

function getModelErrorStatus(error: unknown): MetricStatus {
  return error instanceof ModelCallTimeoutError ? 'timeout' : 'error'
}

function recordModelMetric(params: {
  chatId: number
  metricName: string
  model?: string
  fallbackFrom?: string
  durationMs: number
  status: MetricStatus
}) {
  const { chatId, metricName, model, fallbackFrom, durationMs, status } = params

  logger.info(
    {
      chatId,
      metricType: 'model_call',
      name: metricName,
      model,
      fallbackFrom,
      durationMs,
      status,
    },
    'metric',
  )

  void recordMetric({
    type: 'model_call',
    source: 'agentic',
    name: metricName,
    model,
    fallbackFrom,
    chatId,
    durationMs,
    success: status === 'success',
    status,
    timestamp: Date.now(),
  })
}

async function generateContentWithOptionalTimeout(
  params: Parameters<typeof ai.models.generateContent>[0],
  timeoutMs?: number,
): Promise<GenerateContentResponse> {
  if (!timeoutMs) {
    return ai.models.generateContent(params)
  }

  const model = resolveModelName(params) ?? 'unknown'
  return Promise.race([
    ai.models.generateContent(params),
    new Promise<never>((_, reject) => {
      const handle = setTimeout(
        () => reject(new ModelCallTimeoutError(model, timeoutMs)),
        timeoutMs,
      )
      // biome-ignore lint/suspicious/noExplicitAny: timer unref
      ;(handle as any).unref?.()
    }),
  ])
}

export function isRetryableModelError(error: unknown): boolean {
  const status = (error as { status?: number })?.status
  return status === 429 || status === 503
}

async function generateSingleModelWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  chatId: number,
): Promise<GenerateContentResponse> {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await generateContentWithOptionalTimeout(
        params,
        params.model === CHAT_MODEL ? CHAT_MODEL_TIMEOUT_MS : undefined,
      )
    } catch (error) {
      lastError = error
      const status = (error as { status?: number })?.status
      const isTimeout = error instanceof ModelCallTimeoutError
      const isRetryable = !isTimeout && isRetryableModelError(error)

      if (!isRetryable || attempt === MAX_RETRIES) {
        if (isTimeout) {
          logger.error(
            {
              chatId,
              model: params.model,
              timeoutMs: CHAT_MODEL_TIMEOUT_MS,
              failed: true,
            },
            'model.failed_timeout_over_20s',
          )
        }
        throw error
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      logger.warn(
        { chatId, attempt: attempt + 1, status, delayMs: delay },
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
  const primaryModel = resolveModelName(params)
  const fallbackModel: string = CHAT_MODEL_FALLBACK
  const shouldUseFallback =
    primaryModel === CHAT_MODEL && fallbackModel !== primaryModel
  const startedAt = Date.now()

  try {
    const response = await generateSingleModelWithRetry(params, chatId)
    recordModelMetric({
      chatId,
      metricName,
      model: primaryModel,
      durationMs: Date.now() - startedAt,
      status: 'success',
    })
    return response
  } catch (primaryError) {
    if (
      !shouldUseFallback ||
      !(
        primaryError instanceof ModelCallTimeoutError ||
        isRetryableModelError(primaryError)
      )
    ) {
      recordModelMetric({
        chatId,
        metricName,
        model: primaryModel,
        durationMs: Date.now() - startedAt,
        status: getModelErrorStatus(primaryError),
      })
      throw primaryError
    }

    logger.warn(
      {
        chatId,
        metricType: 'model_call',
        name: metricName,
        model: primaryModel,
        timeoutMs:
          primaryError instanceof ModelCallTimeoutError
            ? CHAT_MODEL_TIMEOUT_MS
            : undefined,
        status: (primaryError as { status?: number })?.status,
        reason:
          primaryError instanceof ModelCallTimeoutError
            ? 'timeout'
            : 'retryable_status',
        fallbackModel,
      },
      'model.primary_fallback',
    )

    try {
      const response = await generateSingleModelWithRetry(
        { ...params, model: fallbackModel },
        chatId,
      )
      recordModelMetric({
        chatId,
        metricName,
        model: fallbackModel,
        fallbackFrom: primaryModel,
        durationMs: Date.now() - startedAt,
        status: 'success',
      })
      return response
    } catch (fallbackError) {
      recordModelMetric({
        chatId,
        metricName,
        model: fallbackModel,
        fallbackFrom: primaryModel,
        durationMs: Date.now() - startedAt,
        status: getModelErrorStatus(fallbackError),
      })
      throw fallbackError
    }
  }
}
