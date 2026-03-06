import type { GenerateContentResponse } from '@google/genai'

import { recordMetric } from '@tg-bot/common'
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

export async function generateSingleModelWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  chatId: number,
  metricName: string,
  timeoutMs?: number,
): Promise<GenerateContentResponse> {
  const model = resolveModelName(params)
  const start = Date.now()
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateContentWithOptionalTimeout(params, timeoutMs)
      const durationMs = Date.now() - start
      logger.info(
        {
          chatId,
          metricType: 'model_call',
          name: metricName,
          model: params.model,
          durationMs,
        },
        'metric',
      )
      void recordMetric({
        type: 'model_call',
        source: 'agentic',
        name: metricName,
        model,
        chatId,
        durationMs,
        success: true,
        timestamp: Date.now(),
      })
      return result
    } catch (error) {
      lastError = error
      const status = (error as { status?: number })?.status
      const isTimeout = error instanceof ModelCallTimeoutError
      const isRetryable = !isTimeout && isRetryableModelError(error)

      if (!isRetryable || attempt === MAX_RETRIES) {
        const durationMs = Date.now() - start
        if (isTimeout) {
          logger.error(
            {
              chatId,
              metricType: 'model_call',
              name: metricName,
              model,
              durationMs,
              timeoutMs,
              failed: true,
            },
            'model.failed_timeout_over_20s',
          )
        }
        void recordMetric({
          type: 'model_call',
          source: 'agentic',
          name: metricName,
          model,
          chatId,
          durationMs,
          success: false,
          timestamp: Date.now(),
        })
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
  const model = resolveModelName(params)
  const fallbackModel: string = CHAT_MODEL_FALLBACK
  const shouldUseFallback = model === CHAT_MODEL && fallbackModel !== model

  if (!shouldUseFallback) {
    return generateSingleModelWithRetry(params, chatId, metricName)
  }

  try {
    return await generateSingleModelWithRetry(
      params,
      chatId,
      metricName,
      CHAT_MODEL_TIMEOUT_MS,
    )
  } catch (error) {
    const shouldFallback =
      error instanceof ModelCallTimeoutError || isRetryableModelError(error)

    if (!shouldFallback) {
      throw error
    }

    logger.warn(
      {
        chatId,
        metricType: 'model_call',
        name: metricName,
        model,
        timeoutMs:
          error instanceof ModelCallTimeoutError
            ? CHAT_MODEL_TIMEOUT_MS
            : undefined,
        status: (error as { status?: number })?.status,
        reason:
          error instanceof ModelCallTimeoutError
            ? 'timeout'
            : 'retryable_status',
        fallbackModel,
      },
      'model.primary_fallback',
    )

    return generateSingleModelWithRetry(
      { ...params, model: fallbackModel },
      chatId,
      `${metricName}_fallback`,
    )
  }
}
