/** Main chat model — smart, handles user intent + tool routing */
export const CHAT_MODEL = 'gemini-3.1-flash-lite-preview'
// export const CHAT_MODEL = 'gemini-3-pro-preview'
// export const CHAT_MODEL = 'gemini-3.1-pro-preview'
// export const CHAT_MODEL = 'gemini-2.5-flash'
// export const CHAT_MODEL = 'gemini-2.5-pro'

/** Fallback when main chat model hangs */
export const CHAT_MODEL_FALLBACK = 'gemini-2.5-flash'
export const CHAT_MODEL_TIMEOUT_MS = 20_000

/** Fast/cheap model for tool execution wrappers (search, code, url, reply gate) */
export const FAST_MODEL = 'gemini-2.5-flash-lite'

/** Search-specific grounded models: preview first, older lite as backup. */
export const SEARCH_MODEL_PRIMARY = 'gemini-3.1-flash-lite-preview'
export const SEARCH_MODEL_FALLBACK = FAST_MODEL
