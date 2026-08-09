import type { AiModelConfig } from '@tg-bot/common'
import { getAiSdkProviderOptions } from '@tg-bot/common'
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
  const isPrimaryChatModel =
    modelConfig.provider === CHAT_MODEL_CONFIG.provider &&
    modelConfig.model === CHAT_MODEL_CONFIG.model
  const isHelperTextModel =
    modelConfig.provider === HELPER_TEXT_MODEL_CONFIG.provider &&
    modelConfig.model === HELPER_TEXT_MODEL_CONFIG.model

  return getAiSdkProviderOptions(modelConfig, {
    reasoningEffort: isPrimaryChatModel
      ? CHAT_MODEL_REASONING_EFFORT
      : isHelperTextModel
        ? HELPER_TEXT_MODEL_REASONING_EFFORT
        : CHAT_FALLBACK_REASONING_EFFORT,
    chatId,
    store: false,
    serviceTier: modelConfig.provider === 'google' ? 'priority' : undefined,
  })
}
