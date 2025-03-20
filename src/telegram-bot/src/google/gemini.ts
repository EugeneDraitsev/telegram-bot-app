import {
  GoogleGenerativeAI,
  type ModelParams,
  type Tool,
} from '@google/generative-ai'

import { getHistory } from '../upstash'
import {
  DEFAULT_ERROR_MESSAGE,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  cleanGeminiMessage,
  geminiSystemInstructions,
  isAiEnabledChat,
} from '../utils'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'
const genAI = new GoogleGenerativeAI(apiKey)

export const generateMultimodalCompletion = async (
  prompt: string,
  chatId: string | number,
  imagesData?: Buffer[],
) => {
  try {
    if (!isAiEnabledChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: geminiSystemInstructions,
    })

    const parts = []
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
      generationConfig: {
        temperature: 1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
        responseMimeType: 'text/plain',
      },
      tools: [
        {
          googleSearch: {},
        } as Tool,
      ],
    })

    const result = await chatSession.sendMessage([
      ...parts,
      { text: prompt || 'Выдай любой комментарий на твой вкус по ситуации' },
    ])
    const text = result.response.text()

    if (!text) {
      return DEFAULT_ERROR_MESSAGE
    }

    return cleanGeminiMessage(text)
  } catch (error) {
    console.error('gemini generateMultimodalCompletion error: ', error)
    return DEFAULT_ERROR_MESSAGE
  }
}

export async function generateImage(
  prompt: string,
  chatId: string | number,
  imagesData?: Buffer[],
) {
  try {
    if (!isAiEnabledChat(chatId)) {
      return { text: NOT_ALLOWED_ERROR }
    }

    if (!prompt && !imagesData?.length) {
      return { text: PROMPT_MISSING_ERROR }
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-exp-image-generation',
      generationConfig: {
        responseModalities: ['Text', 'Image'],
      },
    } as ModelParams)

    const parts = []
    for (const image of imagesData ?? []) {
      parts.push({
        inlineData: {
          data: image.toString('base64'),
          mimeType: 'image/jpeg',
        },
      })
    }

    const response = await model.generateContent([...parts, { text: prompt }])
    const parsedResponse =
      response.response.candidates?.[0].content.parts?.reduce(
        (acc, candidate) => {
          if (candidate.text) {
            acc.text += `${candidate.text}\n`
          }
          if (candidate.inlineData) {
            const imageData = candidate.inlineData.data
            acc.image = Buffer.from(imageData, 'base64')
          }
          return acc
        },
        { text: '' } as { text: string; image?: Buffer },
      )

    if (!parsedResponse?.text && !parsedResponse?.image) {
      console.error(
        'Error empty gemini response:',
        parsedResponse,
        response.response.candidates?.[0].content.parts,
      )
      return { text: DEFAULT_ERROR_MESSAGE }
    }

    return parsedResponse
  } catch (error) {
    console.error('Error generating gemini image:', error)
    return { text: DEFAULT_ERROR_MESSAGE }
  }
}
