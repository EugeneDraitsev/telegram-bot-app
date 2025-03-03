import { GoogleGenerativeAI, type Tool } from '@google/generative-ai'

import { getHistory } from '../upstash'
import {
  DEFAULT_ERROR_MESSAGE,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  geminiSystemInstructions,
  isAiEnabledChat,
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
  systemInstruction: geminiSystemInstructions,
})

export const generateMultimodalCompletion = async (
  prompt: string,
  chatId: string | number,
  imagesData?: Buffer[],
) => {
  try {
    if (!isAiEnabledChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }
    if (!prompt && !imagesData?.length) {
      return PROMPT_MISSING_ERROR
    }

    const parts = []
    if (prompt) {
      parts.push({ text: prompt })
    }

    for (const image of imagesData ?? []) {
      parts.push({
        inlineData: {
          data: image.toString('base64'),
          mimeType: 'image/jpeg',
        },
      })
    }

    const formattedHistory = await getHistory(chatId)
    const chatSession = model.startChat({
      history: formattedHistory,
      generationConfig,
      tools: [
        {
          googleSearch: {},
        } as Tool,
      ],
    })

    const result = await chatSession.sendMessage(
      prompt || 'Выдай любой комментарий на твой вкус по ситуации',
    )
    const text = result.response.text()

    if (!text) {
      return DEFAULT_ERROR_MESSAGE
    }

    return cleanMessage(text)
  } catch (error) {
    console.error('gemini generateMultimodalCompletion error: ', error)
    return DEFAULT_ERROR_MESSAGE
  }
}

export function cleanMessage(message: string) {
  const userIdRegex = /^(\s*(USER|User ID):\s*\d+ \([^)]*\): ?)+/
  let cleanedMessage = message.replace(userIdRegex, '')

  const replyRegex =
    /\s*(?:\[\d+\/\d+\/\d+, \d+:\d+:\d+ [AP]M\]\s*(?:\[In reply to message ID: \d+\])?|\[In reply to message ID:\s*\d+\])\s*$/
  cleanedMessage = cleanedMessage.replace(replyRegex, '')
  return cleanedMessage.trim()
}
