export const GEMINI_FLASH_LITE_MODEL = 'gemini-3.1-flash-lite-preview'

/** Main agent model - handles user intent + tool routing via Gemini. */
export const CHAT_MODEL = GEMINI_FLASH_LITE_MODEL
export const CHAT_MODEL_REASONING_EFFORT = 'none'
export const REPLY_GATE_MODEL = GEMINI_FLASH_LITE_MODEL
export const REPLY_GATE_REASONING_EFFORT = 'none'

export const CHAT_MODEL_TIMEOUT_MS = 45_000

/** OpenAI model reserved for web-backed search tools. */
export const OPENAI_WEB_SEARCH_MODEL = 'gpt-5.4-nano'
export const OPENAI_WEB_SEARCH_REASONING_EFFORT = 'low'
export const OPENAI_WEB_SEARCH_TIMEOUT_MS = 45_000

/** Fast/cheap Gemini model for helper wrappers (code execution). */
export const FAST_MODEL = 'gemini-2.5-flash-lite'

/** Search-specific grounded models: preview first, older lite as backup. */
export const SEARCH_MODEL_PRIMARY = 'gemini-3.1-flash-lite-preview'
export const SEARCH_MODEL_FALLBACK = FAST_MODEL
