/**
 * AI Model configuration for the agent.
 * Single GoogleGenAI instance shared across all modules.
 */

import { GoogleGenAI } from '@google/genai'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'

export const ai = new GoogleGenAI({ apiKey })

// export const CHAT_MODEL = 'gemini-3-flash-preview'
export const CHAT_MODEL = 'gemini-3-pro-preview'
// export const CHAT_MODEL = 'gemini-3.1-pro-preview'
// export const CHAT_MODEL = 'gemini-2.5-flash'
export const REPLY_GATE_MODEL = 'gemini-2.5-flash-lite'
