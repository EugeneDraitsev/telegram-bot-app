import { GoogleGenerativeAI } from '@google/generative-ai'

import {
  DEFAULT_ERROR_MESSAGE,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  isAllowedChat,
  systemInstructions,
} from '../utils'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'
const genAI = new GoogleGenerativeAI(apiKey)
const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: 'text/plain',
}
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash',
  systemInstruction: systemInstructions,
})

export const generateCompletion = async (
  prompt: string,
  chatId: string | number,
) => {
  try {
    if (!isAllowedChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }
    if (!prompt) {
      return PROMPT_MISSING_ERROR
    }

    const chatSession = model.startChat({
      generationConfig,
      tools: [
        {
          googleSearch: {},
          // biome-ignore lint/suspicious/noExplicitAny: <explanation>
        } as any,
      ],
    })

    const result = await chatSession.sendMessage(prompt)
    const text = result.response.text()

    if (!text) {
      return DEFAULT_ERROR_MESSAGE
    }

    return text
  } catch (error) {
    console.log(error.message)
    return DEFAULT_ERROR_MESSAGE
  }
}
