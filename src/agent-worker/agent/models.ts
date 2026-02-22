/**
 * AI Model configurations for the agent
 */

import { ChatGoogleGenerativeAI } from '@langchain/google-genai'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'

export const chatModel = new ChatGoogleGenerativeAI({
  model: 'gemini-3-flash-preview',
  apiKey,
})

export const replyGateModel = new ChatGoogleGenerativeAI({
  model: 'gemini-2.0-flash-lite',
  apiKey,
})
