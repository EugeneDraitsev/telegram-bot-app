import { type Content, GoogleGenAI, Modality } from '@google/genai'
import type { Message } from 'telegram-typings'

import { getHistory } from '../upstash'
import {
  cleanGeminiMessage,
  DEFAULT_ERROR_MESSAGE,
  geminiSystemInstructions,
  isAiEnabledChat,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
} from '../utils'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'
const ai = new GoogleGenAI({ apiKey })

export const generateMultimodalCompletion = async (
  prompt: string,
  message?: Message,
  imagesData?: Buffer[],
  model: string = 'gemini-3-flash-preview',
) => {
  try {
    const chatId = message?.chat?.id
    if (!chatId || !isAiEnabledChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }

    const contents: Content[] = await getHistory(chatId)

    // Add a placeholder for the first message if the first message is from the model
    if (contents[0].role === 'model') {
      contents?.unshift({ role: 'user', parts: [{ text: '' }] })
    }

    for (const image of imagesData ?? []) {
      contents.push({
        role: 'user',
        parts: [
          {
            inlineData: {
              data: image.toString('base64'),
              mimeType: 'image/jpeg',
            },
          },
        ],
      })
    }

    contents.push({
      role: 'user',
      parts: [
        {
          text: JSON.stringify({
            ...message,
            text: prompt || 'Выдай любой комментарий на твой вкус по ситуации',
          }),
        },
      ],
    })

    const result = await ai.models.generateContent({
      model,
      config: {
        ...(!model.includes('gemma')
          ? {
              tools: [{ googleSearch: {} }],
              systemInstruction: geminiSystemInstructions,
            }
          : {}),
      },
      contents,
    })

    const text = result.text

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

    const contents: Content[] = []
    for (const image of imagesData ?? []) {
      contents.push({
        role: 'user',
        parts: [
          {
            inlineData: {
              data: image.toString('base64'),
              mimeType: 'image/jpeg',
            },
          },
        ],
      })
    }

    contents.push({ role: 'user', parts: [{ text: prompt }] })

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: contents,
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    })

    const parsedResponse = response.candidates?.[0].content?.parts?.reduce(
      (acc, candidate) => {
        if (candidate.text) {
          acc.text += `${candidate.text}\n`
        }
        if (candidate.inlineData?.data) {
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
        response.candidates?.[0].content?.parts,
      )
      return { text: DEFAULT_ERROR_MESSAGE, image: null }
    }

    return parsedResponse
  } catch (error) {
    console.error('Error generating gemini image:', error)
    return { text: error.message || DEFAULT_ERROR_MESSAGE }
  }
}
