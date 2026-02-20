/**
 * AI Model configurations for the agent
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { ChatOpenAI } from '@langchain/openai'

const useLocalLlm = process.env.USE_LOCAL_LLM === 'true'

export const chatModel = useLocalLlm
  ? new ChatOpenAI({
      model: 'local-model',
      apiKey: 'dummy_key',
      configuration: {
        baseURL: process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1',
      },
    })
  : new ChatGoogleGenerativeAI({
      model: 'gemini-3-flash-preview',
      apiKey: process.env.GEMINI_API_KEY || 'set_your_token',
    })
