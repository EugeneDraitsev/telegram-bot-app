import { generateText, type ToolSet } from 'ai'

import {
  type AiModelConfig,
  type AiReasoningEffort,
  formatAiModelConfig,
  getAiSdkLanguageModel,
  getAiSdkProviderOptions,
  logger,
  type MetricSource,
  type MetricStatus,
  recordMetric,
} from '@tg-bot/common'
import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from './config'
import {
  CHAT_FALLBACK_MODEL_CONFIG,
  CHAT_FALLBACK_REASONING_EFFORT,
  CHAT_MODEL_CONFIG,
  CHAT_MODEL_TIMEOUT_MS,
} from './models'
import { withTimeout } from './utils'

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never

type GenerateTextOptions<TOOLS extends ToolSet> = DistributiveOmit<
  Parameters<typeof generateText<TOOLS>>[0],
  'model' | 'maxRetries' | 'timeout'
>

type GenerateTextResult<TOOLS extends ToolSet> = Awaited<
  ReturnType<typeof generateText<TOOLS>>
>

export interface GenerateModelWithRetryResult<TOOLS extends ToolSet> {
  response: GenerateTextResult<TOOLS>
  modelConfig: AiModelConfig
  model: string
  fallbackFrom?: string
}

export interface ModelMetricAttribution {
  source: MetricSource
  command?: string
}

export interface ModelFallbackConfig {
  modelConfig: AiModelConfig
  reasoningEffort: AiReasoningEffort
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

function isSameModelConfig(a: AiModelConfig, b: AiModelConfig): boolean {
  return a.provider === b.provider && a.model === b.model
}

function resolveFallbackConfig(
  modelConfig: AiModelConfig,
  fallback?: ModelFallbackConfig,
): ModelFallbackConfig | undefined {
  const resolved =
    fallback ??
    (isSameModelConfig(modelConfig, CHAT_MODEL_CONFIG)
      ? {
          modelConfig: CHAT_FALLBACK_MODEL_CONFIG,
          reasoningEffort: CHAT_FALLBACK_REASONING_EFFORT,
        }
      : undefined)

  return resolved && !isSameModelConfig(modelConfig, resolved.modelConfig)
    ? resolved
    : undefined
}

function getFallbackParams<TOOLS extends ToolSet>(
  params: GenerateTextOptions<TOOLS>,
  chatId: number,
  fallback: ModelFallbackConfig,
): GenerateTextOptions<TOOLS> {
  return {
    ...params,
    providerOptions: getAiSdkProviderOptions(fallback.modelConfig, {
      reasoningEffort: fallback.reasoningEffort,
      chatId,
      store: false,
      serviceTier:
        fallback.modelConfig.provider === 'google' ? 'priority' : undefined,
    }),
  }
}

async function generateSingleModelWithRetry<TOOLS extends ToolSet>(
  modelConfig: AiModelConfig,
  params: GenerateTextOptions<TOOLS>,
  chatId: number,
  timeoutMs: number,
): Promise<GenerateTextResult<TOOLS>> {
  let lastError: unknown
  const model = formatAiModelConfig(modelConfig)

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const request = {
        ...params,
        model: getAiSdkLanguageModel(modelConfig),
        maxRetries: 0,
        timeout: timeoutMs + 1_000,
      } as unknown as Parameters<typeof generateText<TOOLS>>[0]
      const promise = generateText<TOOLS>(request)
      return await withTimeout(
        promise,
        timeoutMs,
        new ModelCallTimeoutError(model, timeoutMs),
      )
    } catch (error) {
      lastError = error
      const isTimeout = error instanceof ModelCallTimeoutError
      const isRetryable = !isTimeout && isRetryableModelError(error)

      if (!isRetryable || attempt === MAX_RETRIES) {
        if (isTimeout) {
          logger.error({ chatId, model, timeoutMs }, 'model.failed_timeout')
        }
        throw error
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      logger.warn(
        {
          chatId,
          model,
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

export async function generateModelWithRetryWithInfo<
  TOOLS extends ToolSet = ToolSet,
>(
  params: GenerateTextOptions<TOOLS>,
  chatId: number,
  metricName: string,
  modelConfig: AiModelConfig = CHAT_MODEL_CONFIG,
  timeoutMs: number = CHAT_MODEL_TIMEOUT_MS,
  attribution: ModelMetricAttribution = { source: 'agentic' },
  fallback?: ModelFallbackConfig,
): Promise<GenerateModelWithRetryResult<TOOLS>> {
  const model = formatAiModelConfig(modelConfig)
  const startedAt = Date.now()

  logger.info(
    {
      chatId,
      name: metricName,
      model,
      timeoutMs,
      ...attribution,
    },
    'model.call_start',
  )

  const track = async (
    attemptStartedAt: number,
    attemptModel: string,
    status: MetricStatus = 'success',
    fallbackFrom?: string,
  ) => {
    await recordMetric({
      type: 'model_call',
      ...attribution,
      name: metricName,
      model: attemptModel,
      fallbackFrom,
      chatId,
      durationMs: Date.now() - attemptStartedAt,
      success: status === 'success',
      status,
      timestamp: Date.now(),
    })
  }

  try {
    const response = await generateSingleModelWithRetry(
      modelConfig,
      params,
      chatId,
      timeoutMs,
    )
    await track(startedAt, model)
    return { response, modelConfig, model }
  } catch (primaryError) {
    await track(startedAt, model, getModelErrorStatus(primaryError))

    const resolvedFallback = resolveFallbackConfig(modelConfig, fallback)
    if (!resolvedFallback) {
      throw primaryError
    }

    const fallbackStartedAt = Date.now()
    const fallbackModel = formatAiModelConfig(resolvedFallback.modelConfig)
    logger.warn(
      {
        chatId,
        name: metricName,
        model: fallbackModel,
        fallbackFrom: model,
        ...attribution,
        error: primaryError,
      },
      'model.fallback_invoked',
    )
    logger.info(
      {
        chatId,
        name: metricName,
        model: fallbackModel,
        timeoutMs,
        fallbackFrom: model,
        ...attribution,
      },
      'model.call_start',
    )

    try {
      const response = await generateSingleModelWithRetry(
        resolvedFallback.modelConfig,
        getFallbackParams(params, chatId, resolvedFallback),
        chatId,
        timeoutMs,
      )
      await track(fallbackStartedAt, fallbackModel, 'success', model)
      return {
        response,
        modelConfig: resolvedFallback.modelConfig,
        model: fallbackModel,
        fallbackFrom: model,
      }
    } catch (fallbackError) {
      await track(
        fallbackStartedAt,
        fallbackModel,
        getModelErrorStatus(fallbackError),
        model,
      )
      throw fallbackError
    }
  }
}
