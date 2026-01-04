import { GoogleGenAI } from '@google/genai'
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

type InteractionInput = {
  role: 'user' | 'model'
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mime_type: string }
  >
}

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

    const history: InteractionInput[] = await getHistory(chatId)

    // Add a placeholder for the first message if the first message is from the model
    if (history?.[0]?.role === 'model') {
      history?.unshift({ role: 'user', content: [{ type: 'text', text: '' }] })
    }

    // Add images to history
    for (const image of imagesData ?? []) {
      history.push({
        role: 'user',
        content: [
          {
            type: 'image',
            data: image.toString('base64'),
            mime_type: 'image/jpeg',
          },
        ],
      })
    }

    // Add current prompt
    history.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            ...message,
            text: prompt || 'Выдай любой комментарий на твой вкус по ситуации',
          }),
        },
      ],
    })

    const interaction = await ai.interactions.create({
      model,
      input: history,
      ...(!model.includes('gemma')
        ? {
            tools: [{ type: 'google_search' }],
            system_instruction: geminiSystemInstructions,
          }
        : {}),
    })

    const textOutput = interaction.outputs?.find((o) => o.type === 'text')
    const text = textOutput?.text

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

    // Get message history for context
    const history: InteractionInput[] = await getHistory(chatId)

    // Add images from the current request
    for (const image of imagesData ?? []) {
      history.push({
        role: 'user',
        content: [
          {
            type: 'image',
            data: image.toString('base64'),
            mime_type: 'image/jpeg',
          },
        ],
      })
    }

    // Add current prompt
    history.push({ role: 'user', content: [{ type: 'text', text: prompt }] })

    const interaction = await ai.interactions.create({
      model: 'gemini-2.5-flash-image',
      input: history,
      response_modalities: ['image', 'text'],
    })

    const parsedResponse = interaction.outputs?.reduce(
      (acc, output) => {
        if (output.type === 'text' && output.text) {
          acc.text += `${output.text}\n`
        }
        if (output.type === 'image' && output.data) {
          acc.image = Buffer.from(output.data, 'base64')
        }
        return acc
      },
      { text: '' } as { text: string; image?: Buffer },
    )

    if (!parsedResponse?.text && !parsedResponse?.image) {
      console.error(
        'Error empty gemini response:',
        JSON.stringify({ parsedResponse, outputs: interaction.outputs }),
      )
      return { text: DEFAULT_ERROR_MESSAGE, image: null }
    }

    return parsedResponse
  } catch (error) {
    console.error('Error generating gemini image:', error)
    return { text: error.message || DEFAULT_ERROR_MESSAGE }
  }
}
