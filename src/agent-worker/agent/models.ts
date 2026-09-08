/**
 * Language models, reasoning effort, fallback and timeout for each agent role.
 * Reasoning effort reaches OpenAI only; the Google provider drops it.
 * Media model selection belongs to services/image-generation.ts,
 * services/google-media.ts and services/openai-tts.ts.
 */

import {
  type AiModelConfig,
  type AiReasoningEffort,
  formatAiModelConfig,
  getAiSdkProviderOptions,
} from '@tg-bot/common'

/** A model together with the reasoning effort it is called with. */
export interface ModelChoice {
  config: AiModelConfig
  reasoningEffort: AiReasoningEffort
  /** `provider/model`, used for logs and metrics. */
  label: string
}

export interface ModelRole {
  primary: ModelChoice
  /** Tried once when the primary model fails or times out. */
  fallback: ModelChoice
  /** Budget for a single attempt. */
  timeoutMs: number
}

const choose = (
  config: AiModelConfig,
  reasoningEffort: AiReasoningEffort,
): ModelChoice => ({
  config,
  reasoningEffort,
  label: formatAiModelConfig(config),
})

const openai = (model: string, reasoningEffort: AiReasoningEffort) =>
  choose({ provider: 'openai', model }, reasoningEffort)

const google = (model: string) => choose({ provider: 'google', model }, 'none')

/** Engage/ignore decision on every eligible message: the hot path. */
export const REPLY_GATE_ROLE: ModelRole = {
  primary: openai('gpt-5.6-luna', 'none'),
  fallback: google('gemini-3.5-flash-lite'),
  timeoutMs: 15_000,
}

/** Routing, tool loop, final synthesis and the code_execution tool. */
export const CHAT_ROLE: ModelRole = {
  primary: openai('gpt-6-astra', 'low'),
  fallback: google('gemini-3.8-flash'),
  timeoutMs: 25_000,
}

/** Web-backed search tools. */
export const WEB_SEARCH_ROLE: ModelRole = {
  primary: openai('gpt-5.6-luna', 'low'),
  fallback: openai('gpt-5.4-nano', 'low'),
  timeoutMs: 24_000,
}

/** Budget for a web search tool call: both attempts plus room between them. */
export const WEB_SEARCH_TOTAL_TIMEOUT_MS = WEB_SEARCH_ROLE.timeoutMs * 2 + 2_000

/** `/o` asks the chat model to think longer; every other command uses the default. */
export function resolveAgentChatModel(commandName?: string): ModelChoice {
  return commandName === 'o'
    ? { ...CHAT_ROLE.primary, reasoningEffort: 'medium' }
    : CHAT_ROLE.primary
}

export function getModelProviderOptions(
  choice: ModelChoice,
  options: { chatId?: string | number; truncation?: string } = {},
) {
  return getAiSdkProviderOptions(choice.config, {
    ...options,
    reasoningEffort: choice.reasoningEffort,
    store: false,
    serviceTier: choice.config.provider === 'google' ? 'priority' : undefined,
    // Telegram audio is a file part. Let OpenAI Responses forward media types
    // beyond the provider's conservative allowlist; Gemini accepts them natively.
    passThroughUnsupportedFiles: true,
  })
}
