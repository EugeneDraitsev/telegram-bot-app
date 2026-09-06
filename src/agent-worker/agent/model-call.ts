import { generateText, type ToolSet } from 'ai'

import {
  getAiSdkLanguageModel,
  logger,
  type MetricSource,
  type MetricStatus,
  recordMetric,
} from '@tg-bot/common'
import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from './config'
import { getModelProviderOptions, type ModelChoice } from './models'
import { withTimeout } from './utils'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

type GenerateTextOptions<TOOLS extends ToolSet> = DistributiveOmit<
  Parameters<typeof generateText<TOOLS>>[0],
  'model' | 'maxRetries' | 'timeout' | 'providerOptions'
>

type GenerateTextResult<TOOLS extends ToolSet> = Awaited<
  ReturnType<typeof generateText<TOOLS>>
>

export interface ModelMetricAttribution {
  source: MetricSource
  command?: string
}

export interface ModelCallOptions {
  chatId: number
  /** Stage recorded in metrics, for example `routing`. */
  metricName: string
  choice: ModelChoice
  /** Tried once when the primary model fails; omit to fail instead. */
  fallback?: ModelChoice
  timeoutMs: number
  attribution?: ModelMetricAttribution
  /** OpenAI Responses only: drop oldest context instead of failing on overflow. */
  truncation?: string
}

export interface ModelCallResult<TOOLS extends ToolSet> {
  response: GenerateTextResult<TOOLS>
  /** The model that answered - the fallback when one was used. */
  choice: ModelChoice
  fallbackFrom?: string
}

export class ModelCallTimeoutError extends Error {
  constructor(
    readonly model: string,
    readonly timeoutMs: number,
  ) {
    super(`Model ${model} timed out after ${timeoutMs}ms`)
    this.name = 'ModelCallTimeoutError'
  }
}

function getErrorStatusCode(error: unknown): number | undefined {
  const record = error as { status?: unknown; statusCode?: unknown }
  if (typeof record?.status === 'number') {
    return record.status
  }
  if (typeof record?.statusCode === 'number') {
    return record.statusCode
  }
  return undefined
}

export function isRetryableModelError(error: unknown): boolean {
  const status = getErrorStatusCode(error)
  return (
    status === 408 ||
    status === 429 ||
    (typeof status === 'number' && status >= 500)
  )
}

function getModelErrorStatus(error: unknown): MetricStatus {
  return error instanceof ModelCallTimeoutError ? 'timeout' : 'error'
}

async function generateWithRetry<TOOLS extends ToolSet>(
  params: GenerateTextOptions<TOOLS>,
  choice: ModelChoice,
  options: ModelCallOptions,
): Promise<GenerateTextResult<TOOLS>> {
  const { chatId, timeoutMs } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const request = {
        ...params,
        model: getAiSdkLanguageModel(choice.config),
        providerOptions: getModelProviderOptions(choice, {
          chatId,
          truncation: options.truncation,
        }),
        maxRetries: 0,
        timeout: timeoutMs + 1_000,
      } as unknown as Parameters<typeof generateText<TOOLS>>[0]
      const promise = generateText<TOOLS>(request)
      return await withTimeout(
        promise,
        timeoutMs,
        new ModelCallTimeoutError(choice.label, timeoutMs),
      )
    } catch (error) {
      lastError = error
      const isTimeout = error instanceof ModelCallTimeoutError
      const isRetryable = !isTimeout && isRetryableModelError(error)

      if (!isRetryable || attempt === MAX_RETRIES) {
        if (isTimeout) {
          logger.error(
            { chatId, model: choice.label, timeoutMs },
            'model.failed_timeout',
          )
        }
        throw error
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      logger.warn(
        {
          chatId,
          model: choice.label,
          attempt: attempt + 1,
          status: getErrorStatusCode(error),
          delayMs: delay,
        },
        'model.retry',
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export async function generateModelWithRetry<TOOLS extends ToolSet = ToolSet>(
  params: GenerateTextOptions<TOOLS>,
  options: ModelCallOptions,
): Promise<ModelCallResult<TOOLS>> {
  const { chatId, metricName, choice, fallback, timeoutMs } = options
  const attribution = options.attribution ?? { source: 'agentic' }

  const track = async (
    startedAt: number,
    attempt: ModelChoice,
    status: MetricStatus,
    fallbackFrom?: string,
  ) => {
    await recordMetric({
      type: 'model_call',
      ...attribution,
      name: metricName,
      model: attempt.label,
      fallbackFrom,
      chatId,
      durationMs: Date.now() - startedAt,
      success: status === 'success',
      status,
      timestamp: Date.now(),
    })
  }

  const attempt = async (
    model: ModelChoice,
    fallbackFrom?: string,
  ): Promise<ModelCallResult<TOOLS>> => {
    const startedAt = Date.now()
    logger.info(
      {
        chatId,
        name: metricName,
        model: model.label,
        reasoningEffort: model.reasoningEffort,
        timeoutMs,
        fallbackFrom,
        ...attribution,
      },
      'model.call_start',
    )

    try {
      const response = await generateWithRetry(params, model, options)
      await track(startedAt, model, 'success', fallbackFrom)
      return { response, choice: model, fallbackFrom }
    } catch (error) {
      await track(startedAt, model, getModelErrorStatus(error), fallbackFrom)
      throw error
    }
  }

  try {
    return await attempt(choice)
  } catch (primaryError) {
    if (!fallback) {
      throw primaryError
    }

    logger.warn(
      {
        chatId,
        name: metricName,
        model: fallback.label,
        fallbackFrom: choice.label,
        ...attribution,
        error: primaryError,
      },
      'model.fallback_invoked',
    )
    return attempt(fallback, choice.label)
  }
}
