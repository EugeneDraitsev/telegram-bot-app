/** Main agent model - handles user intent + tool routing via OpenAI Responses. */
export const CHAT_MODEL = 'gpt-5.4-nano'
export const CHAT_MODEL_REASONING_EFFORT = 'medium'
export const REPLY_GATE_MODEL = CHAT_MODEL
export const REPLY_GATE_REASONING_EFFORT = 'low'

export const CHAT_MODEL_TIMEOUT_MS = 45_000

/** Fast/cheap Gemini model for helper wrappers (code execution). */
export const FAST_MODEL = 'gemini-2.5-flash-lite'

/** Search-specific grounded models: preview first, older lite as backup. */
export const SEARCH_MODEL_PRIMARY = 'gemini-3.1-flash-lite-preview'
export const SEARCH_MODEL_FALLBACK = FAST_MODEL
