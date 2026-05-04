/**
 * AI model configuration for the agent.
 * The manual tool loop still uses the Google SDK until that loop is migrated.
 */

import {
  type GenerateContentParameters,
  type GenerateContentResponse,
  GoogleGenAI,
} from '@google/genai'

export {
  CHAT_MODEL,
  CHAT_MODEL_CONFIG,
  CHAT_MODEL_LABEL,
  CHAT_MODEL_REASONING_EFFORT,
  CHAT_MODEL_TIMEOUT_MS,
  FAST_MODEL,
  FAST_TEXT_MODEL,
  FAST_TEXT_MODEL_CONFIG,
  GEMINI_FLASH_LITE_MODEL,
  HELPER_TEXT_MODEL_CONFIG,
  OPENAI_WEB_SEARCH_MODEL,
  OPENAI_WEB_SEARCH_REASONING_EFFORT,
  OPENAI_WEB_SEARCH_TIMEOUT_MS,
  REPLY_GATE_MODEL,
  REPLY_GATE_MODEL_CONFIG,
  REPLY_GATE_REASONING_EFFORT,
  SEARCH_MODEL_FALLBACK,
  SEARCH_MODEL_FALLBACK_CONFIG,
  SEARCH_MODEL_PRIMARY,
  SEARCH_MODEL_PRIMARY_CONFIG,
  WEB_SEARCH_MODEL_CONFIG,
  WEB_SEARCH_MODEL_ID,
} from './model-constants'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'

export const ai = new GoogleGenAI({ apiKey })

export const geminiModels = {
  generateContent: (
    params: GenerateContentParameters,
  ): Promise<GenerateContentResponse> => ai.models.generateContent(params),
}
