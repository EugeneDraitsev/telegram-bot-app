import {
  type AiModelConfig,
  DEFAULT_FAST_TEXT_MODEL,
  DEFAULT_HELPER_TEXT_MODEL,
  DEFAULT_OPENAI_TEXT_MODEL,
  DEFAULT_WEB_SEARCH_MODEL,
  formatAiModelConfig,
  getAiModelConfig,
} from '@tg-bot/common'

const DEFAULT_AGENT_CHAT_FALLBACK_MODEL: AiModelConfig = {
  provider: 'openai',
  model: 'gpt-5.4-nano',
}

const DEFAULT_AGENT_CHAT_MODEL: AiModelConfig = {
  provider: 'google',
  model: 'gemini-3.5-flash',
}

const DEFAULT_REPLY_GATE_MODEL: AiModelConfig = {
  provider: 'google',
  model: 'gemini-3.1-flash-lite',
}

export const FAST_TEXT_MODEL_CONFIG = getAiModelConfig(
  'FAST_TEXT_MODEL',
  DEFAULT_FAST_TEXT_MODEL,
)
export const CHAT_MODEL_CONFIG = getAiModelConfig(
  'AGENT_CHAT_MODEL',
  DEFAULT_AGENT_CHAT_MODEL,
)
export const CHAT_FALLBACK_MODEL_CONFIG = getAiModelConfig(
  'AGENT_CHAT_FALLBACK_MODEL',
  DEFAULT_AGENT_CHAT_FALLBACK_MODEL,
)
export const REPLY_GATE_MODEL_CONFIG = getAiModelConfig(
  'REPLY_GATE_MODEL',
  DEFAULT_REPLY_GATE_MODEL,
)
export const REPLY_GATE_FALLBACK_MODEL_CONFIG = getAiModelConfig(
  'REPLY_GATE_FALLBACK_MODEL',
  DEFAULT_WEB_SEARCH_MODEL,
)
export const HELPER_TEXT_MODEL_CONFIG = getAiModelConfig(
  'HELPER_TEXT_MODEL',
  DEFAULT_HELPER_TEXT_MODEL,
)
export const WEB_SEARCH_MODEL_CONFIG = getAiModelConfig(
  'WEB_SEARCH_MODEL',
  DEFAULT_WEB_SEARCH_MODEL,
)
export const FAST_TEXT_MODEL = formatAiModelConfig(FAST_TEXT_MODEL_CONFIG)

/** Main agent model used for routing/tool loop and final synthesis. */
export const CHAT_MODEL = CHAT_MODEL_CONFIG.model
export const CHAT_MODEL_LABEL = formatAiModelConfig(CHAT_MODEL_CONFIG)
export const CHAT_MODEL_REASONING_EFFORT = 'none'
export const CHAT_FALLBACK_MODEL = formatAiModelConfig(
  CHAT_FALLBACK_MODEL_CONFIG,
)
export const CHAT_FALLBACK_REASONING_EFFORT = 'medium'

export function resolveAgentChatModel(commandName?: string) {
  const config =
    commandName === 'o' ? DEFAULT_OPENAI_TEXT_MODEL : CHAT_MODEL_CONFIG
  const isDefaultChatModel =
    config.provider === CHAT_MODEL_CONFIG.provider &&
    config.model === CHAT_MODEL_CONFIG.model

  return {
    config,
    label: formatAiModelConfig(config),
    reasoningEffort: isDefaultChatModel
      ? CHAT_MODEL_REASONING_EFFORT
      : CHAT_FALLBACK_REASONING_EFFORT,
  }
}
export const REPLY_GATE_MODEL = formatAiModelConfig(REPLY_GATE_MODEL_CONFIG)
export const REPLY_GATE_FALLBACK_MODEL = formatAiModelConfig(
  REPLY_GATE_FALLBACK_MODEL_CONFIG,
)
export const REPLY_GATE_REASONING_EFFORT = 'none'
export const REPLY_GATE_FALLBACK_REASONING_EFFORT = 'low'

export const CHAT_MODEL_TIMEOUT_MS = 45_000

/** Model reserved for web-backed search tools. */
export const WEB_SEARCH_MODEL_ID = WEB_SEARCH_MODEL_CONFIG.model
export const OPENAI_WEB_SEARCH_REASONING_EFFORT = 'low'
export const OPENAI_WEB_SEARCH_TIMEOUT_MS = 45_000

/** Fast/cheap helper model for wrappers (code execution). */
export const FAST_MODEL = HELPER_TEXT_MODEL_CONFIG.model
