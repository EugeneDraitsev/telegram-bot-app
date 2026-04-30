/**
 * AI Model configuration for the agent.
 * Single GoogleGenAI instance shared across all modules.
 */

import { GoogleGenAI } from '@google/genai'

export {
  CHAT_MODEL,
  CHAT_MODEL_REASONING_EFFORT,
  CHAT_MODEL_TIMEOUT_MS,
  FAST_MODEL,
  REPLY_GATE_MODEL,
  REPLY_GATE_REASONING_EFFORT,
  SEARCH_MODEL_FALLBACK,
  SEARCH_MODEL_PRIMARY,
} from './model-constants'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'

export const ai = new GoogleGenAI({ apiKey })
