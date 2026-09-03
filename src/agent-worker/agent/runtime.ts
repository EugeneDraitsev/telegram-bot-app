import type { AiModelConfig, AiReasoningEffort } from '@tg-bot/common'
import { getAiSdkProviderOptions } from '@tg-bot/common'

export function extractErrorInfo(error: unknown): unknown {
  if (!(error instanceof Error)) return error
  const record = error as unknown as Record<string, unknown>
  return {
    name: error.name,
    message: error.message,
    ...('status' in error ? { status: record.status } : {}),
    ...('statusText' in error ? { statusText: record.statusText } : {}),
    ...('errorDetails' in error ? { errorDetails: record.errorDetails } : {}),
  }
}

export function getChatProviderOptions(
  modelConfig: AiModelConfig,
  chatId: number,
  reasoningEffort: AiReasoningEffort,
) {
  return getAiSdkProviderOptions(modelConfig, {
    reasoningEffort,
    chatId,
    store: false,
    serviceTier: modelConfig.provider === 'google' ? 'priority' : undefined,
    // Telegram audio is a file part. Let OpenAI Responses forward media types
    // beyond the provider's conservative allowlist; Gemini accepts them natively.
    passThroughUnsupportedFiles: true,
  })
}
