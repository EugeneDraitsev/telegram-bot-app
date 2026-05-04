import { generateText, type ToolSet } from 'ai'

import {
  type AiModelConfig,
  formatAiModelConfig,
  getAiSdkLanguageModel,
  logger,
  type MetricStatus,
  recordMetric,
} from '@tg-bot/common'
import { MAX_RETRIES, RETRY_BASE_DELAY_MS } from './config'
import { CHAT_MODEL_CONFIG, CHAT_MODEL_TIMEOUT_MS } from './models'
import { withTimeout } from './utils'

type GenerateTextOptions<TOOLS extends ToolSet> = Omit<
  Parameters<typeof generateText<TOOLS>>[0],
  'model' | 'maxRetries' | 'timeout'
>

type GenerateTextResult<TOOLS extends ToolSet> = Awaited<
  ReturnType<typeof generateText<TOOLS>>
>

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
      const promise = generateText<TOOLS>({
        ...params,
        model: getAiSdkLanguageModel(modelConfig),
        maxRetries: 0,
        timeout: timeoutMs + 1_000,
      } as Parameters<typeof generateText<TOOLS>>[0])
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

export async function generateModelWithRetry<TOOLS extends ToolSet = ToolSet>(
  params: GenerateTextOptions<TOOLS>,
  chatId: number,
  metricName: string,
  modelConfig: AiModelConfig = CHAT_MODEL_CONFIG,
  timeoutMs: number = CHAT_MODEL_TIMEOUT_MS,
): Promise<GenerateTextResult<TOOLS>> {
  const model = formatAiModelConfig(modelConfig)
  const startedAt = Date.now()

  logger.info(
    {
      chatId,
      name: metricName,
      model,
      timeoutMs,
    },
    'model.call_start',
  )

  const track = (status: MetricStatus = 'success') => {
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
    const response = await generateSingleModelWithRetry(
      modelConfig,
      params,
      chatId,
      timeoutMs,
    )
    track()
    return response
  } catch (error) {
    track(getModelErrorStatus(error))
    throw error
  }
}
