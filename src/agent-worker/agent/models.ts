/**
 * AI model configuration for the agent.
 *
 * Model values are provider-neutral and resolved through the AI SDK helpers.
 */

import {
  type AiModelConfig,
  DEFAULT_FAST_TEXT_FALLBACK_MODEL,
  DEFAULT_FAST_TEXT_MODEL,
  DEFAULT_HELPER_TEXT_FALLBACK_MODEL,
  DEFAULT_HELPER_TEXT_MODEL,
  DEFAULT_OPENAI_NANO_MODEL,
  DEFAULT_OPENAI_TEXT_MODEL,
  DEFAULT_WEB_SEARCH_MODEL,
  formatAiModelConfig,
  getAiModelConfig,
  isSameAiModel,
} from '@tg-bot/common'

export const CHAT_MODEL_CONFIG = getAiModelConfig(
  'AGENT_CHAT_MODEL',
  DEFAULT_FAST_TEXT_MODEL,
)
export const CHAT_FALLBACK_MODEL_CONFIG = getAiModelConfig(
  'AGENT_CHAT_FALLBACK_MODEL',
  DEFAULT_FAST_TEXT_FALLBACK_MODEL,
)
export const REPLY_GATE_MODEL_CONFIG = getAiModelConfig(
  'REPLY_GATE_MODEL',
  DEFAULT_HELPER_TEXT_MODEL,
)
export const REPLY_GATE_FALLBACK_MODEL_CONFIG = getAiModelConfig(
  'REPLY_GATE_FALLBACK_MODEL',
  DEFAULT_HELPER_TEXT_FALLBACK_MODEL,
)
export const HELPER_TEXT_MODEL_CONFIG = getAiModelConfig(
  'HELPER_TEXT_MODEL',
  DEFAULT_HELPER_TEXT_MODEL,
)
export const HELPER_TEXT_FALLBACK_MODEL_CONFIG = getAiModelConfig(
  'HELPER_TEXT_FALLBACK_MODEL',
  DEFAULT_HELPER_TEXT_FALLBACK_MODEL,
)
export const WEB_SEARCH_MODEL_CONFIG = getAiModelConfig(
  'WEB_SEARCH_MODEL',
  DEFAULT_WEB_SEARCH_MODEL,
)
export const WEB_SEARCH_FALLBACK_MODEL_CONFIG = getAiModelConfig(
  'WEB_SEARCH_FALLBACK_MODEL',
  DEFAULT_OPENAI_NANO_MODEL,
)
/** Main agent model used for routing/tool loop and final synthesis. */
export const CHAT_MODEL_REASONING_EFFORT = 'none'
export const CHAT_FALLBACK_REASONING_EFFORT = 'medium'

export function getChatModelReasoningEffort(config: AiModelConfig) {
  if (isSameAiModel(config, DEFAULT_OPENAI_TEXT_MODEL)) return 'low'
  if (isSameAiModel(config, CHAT_MODEL_CONFIG))
    return CHAT_MODEL_REASONING_EFFORT
  if (isSameAiModel(config, HELPER_TEXT_MODEL_CONFIG)) {
    return HELPER_TEXT_MODEL_REASONING_EFFORT
  }
  return CHAT_FALLBACK_REASONING_EFFORT
}

export function resolveAgentChatModel(commandName?: string) {
  const config =
    commandName === 'o' ? DEFAULT_OPENAI_TEXT_MODEL : CHAT_MODEL_CONFIG

  return {
    config,
    label: formatAiModelConfig(config),
    reasoningEffort: getChatModelReasoningEffort(config),
  }
}
export const REPLY_GATE_MODEL = formatAiModelConfig(REPLY_GATE_MODEL_CONFIG)
export const REPLY_GATE_FALLBACK_MODEL = formatAiModelConfig(
  REPLY_GATE_FALLBACK_MODEL_CONFIG,
)
export const REPLY_GATE_REASONING_EFFORT = 'none'
export const REPLY_GATE_FALLBACK_REASONING_EFFORT = 'low'

export const HELPER_TEXT_MODEL_REASONING_EFFORT = 'none'
export const HELPER_TEXT_FALLBACK_REASONING_EFFORT = 'none'

export const CHAT_MODEL_TIMEOUT_MS = 45_000

/** Model reserved for web-backed search tools. */
export const OPENAI_WEB_SEARCH_REASONING_EFFORT = 'low'
export const WEB_SEARCH_ATTEMPT_TIMEOUT_MS = 24_000
export const WEB_SEARCH_TOTAL_TIMEOUT_MS = 50_000
