import type { AiModelConfig } from '@tg-bot/common'
import { getAiSdkProviderOptions, isSameAiModel } from '@tg-bot/common'
import {
  CHAT_FALLBACK_REASONING_EFFORT,
  CHAT_MODEL_CONFIG,
  CHAT_MODEL_REASONING_EFFORT,
  HELPER_TEXT_MODEL_CONFIG,
  HELPER_TEXT_MODEL_REASONING_EFFORT,
} from './models'

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
) {
  return getAiSdkProviderOptions(modelConfig, {
    reasoningEffort: isSameAiModel(modelConfig, CHAT_MODEL_CONFIG)
      ? CHAT_MODEL_REASONING_EFFORT
      : isSameAiModel(modelConfig, HELPER_TEXT_MODEL_CONFIG)
        ? HELPER_TEXT_MODEL_REASONING_EFFORT
        : CHAT_FALLBACK_REASONING_EFFORT,
    chatId,
    store: false,
    serviceTier: modelConfig.provider === 'google' ? 'priority' : undefined,
    // Telegram audio is a file part. Let OpenAI Responses forward media types
    // beyond the provider's conservative allowlist; Gemini accepts them natively.
    passThroughUnsupportedFiles: true,
  })
}
