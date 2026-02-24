/**
 * AI Model configuration for the agent.
 * Single GoogleGenAI instance shared across all modules.
 */

import { GoogleGenAI } from '@google/genai'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'

export const ai = new GoogleGenAI({ apiKey })

/** Main chat model — smart, handles user intent + tool routing */
export const CHAT_MODEL = 'gemini-3-flash-preview'
// export const CHAT_MODEL = 'gemini-3-pro-preview'
// export const CHAT_MODEL = 'gemini-3.1-pro-preview'
// export const CHAT_MODEL = 'gemini-2.5-flash'
// export const CHAT_MODEL = 'gemini-2.5-pro'

/** Fallback when main chat model hangs */
export const CHAT_MODEL_FALLBACK = 'gemini-2.5-flash'
export const CHAT_MODEL_TIMEOUT_MS = 20_000

/** Fast/cheap model for tool execution wrappers (search, code, url, reply gate) */
export const FAST_MODEL = 'gemini-2.5-flash-lite'
