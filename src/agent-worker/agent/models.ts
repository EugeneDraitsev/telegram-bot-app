/**
 * AI Model configurations for the agent
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'

export const chatModel = new ChatGoogleGenerativeAI({
  model: 'gemini-3-flash-preview',
  apiKey: process.env.GEMINI_API_KEY || 'set_your_token',
})
