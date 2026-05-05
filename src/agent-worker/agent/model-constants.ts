import {
  DEFAULT_FAST_TEXT_MODEL,
  DEFAULT_HELPER_TEXT_MODEL,
  DEFAULT_WEB_SEARCH_MODEL,
  formatAiModelConfig,
  getAiModelConfig,
} from '@tg-bot/common'

export const FAST_TEXT_MODEL_CONFIG = getAiModelConfig(
  'FAST_TEXT_MODEL',
  DEFAULT_FAST_TEXT_MODEL,
)
export const CHAT_MODEL_CONFIG = getAiModelConfig(
  'AGENT_CHAT_MODEL',
  FAST_TEXT_MODEL_CONFIG,
)
export const REPLY_GATE_MODEL_CONFIG = getAiModelConfig(
  'REPLY_GATE_MODEL',
  FAST_TEXT_MODEL_CONFIG,
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
export const SEARCH_MODEL_PRIMARY_CONFIG = getAiModelConfig(
  'GROUNDED_SEARCH_MODEL_PRIMARY',
  FAST_TEXT_MODEL_CONFIG,
)
export const SEARCH_MODEL_FALLBACK_CONFIG = getAiModelConfig(
  'GROUNDED_SEARCH_MODEL_FALLBACK',
  HELPER_TEXT_MODEL_CONFIG,
)

export const FAST_TEXT_MODEL = formatAiModelConfig(FAST_TEXT_MODEL_CONFIG)

/** Main agent model - current manual tool loop still requires a Google model id. */
export const CHAT_MODEL = CHAT_MODEL_CONFIG.model
export const CHAT_MODEL_LABEL = formatAiModelConfig(CHAT_MODEL_CONFIG)
export const CHAT_MODEL_REASONING_EFFORT = 'none'
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

/** Search-specific grounded models: preview first, older lite as backup. */
export const SEARCH_MODEL_PRIMARY = SEARCH_MODEL_PRIMARY_CONFIG.model
export const SEARCH_MODEL_FALLBACK = FAST_MODEL
