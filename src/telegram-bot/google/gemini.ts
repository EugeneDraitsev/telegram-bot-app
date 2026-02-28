import { GoogleGenAI } from '@google/genai'
import type { Message } from 'telegram-typings'

import {
  cleanGeminiMessage,
  DEFAULT_ERROR_MESSAGE,
  EMPTY_RESPONSE_ERROR,
  geminiSystemInstructions,
  getHistory,
  isAiEnabledChat,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  systemInstructions,
} from '@tg-bot/common'

const apiKey = process.env.GEMINI_API_KEY || 'set_your_token'
const ai = new GoogleGenAI({ apiKey })
const imageGenerationSystemInstruction = `
  ${systemInstructions}

  For /ge image generation command:
  - Always return at least one generated image in the response.
  - Never return a text-only response.
  - If prompt is unclear, choose the best interpretation and still generate an image.
  - If prompt is disallowed, generate a safe alternative image and explain shortly in text.
`

type InteractionInput = {
  role: 'user' | 'model'
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; data: string; mime_type: 'image/jpeg' }
  >
}

type InteractionOutput = {
  type: 'text' | 'image'
  text?: string
  data?: string
}

type InteractionResponse = {
  outputs?: InteractionOutput[]
}

type CreateInteraction = (
  request: Record<string, unknown>,
) => Promise<InteractionResponse>

const createGeminiInteraction: CreateInteraction = (request) =>
  ai.interactions.create(request as never) as Promise<InteractionResponse>

export const generateMultimodalCompletion = async (
  prompt: string,
  message?: Message,
  imagesData?: Buffer[],
  model: string = 'gemini-3-flash-preview',
  createInteraction: CreateInteraction = createGeminiInteraction,
) => {
  try {
    const chatId = message?.chat?.id
    if (!chatId || !isAiEnabledChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }

    const history: InteractionInput[] = await getHistory(chatId)

    // Add a placeholder for the first message if the first message is from the model
    if (history?.[0]?.role === 'model') {
      history?.unshift({
        role: 'user',
        content: [{ type: 'text', text: '...' }],
      })
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

    const interaction = await createInteraction({
      model,
      input: history,
      ...(!model.includes('gemma')
        ? {
            tools: [{ type: 'google_search' }, { type: 'url_context' }],
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
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes('Missing text in content of type text')) {
      return EMPTY_RESPONSE_ERROR
    }
    return DEFAULT_ERROR_MESSAGE
  }
}

export async function generateImage(
  prompt: string,
  chatId: string | number,
  imagesData?: Buffer[],
  createInteraction: CreateInteraction = createGeminiInteraction,
) {
  try {
    if (!isAiEnabledChat(chatId)) {
      return { text: NOT_ALLOWED_ERROR }
    }

    if (!prompt && !imagesData?.length) {
      return { text: PROMPT_MISSING_ERROR }
    }

    // Get message history for context
    const history: InteractionInput[] = [] // await getHistory(chatId)

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
    if (prompt) {
      history.push({ role: 'user', content: [{ type: 'text', text: prompt }] })
    }

    const maxRetries = 3
    let fallbackText = ''

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const interaction = await createInteraction({
        model: 'gemini-3.1-flash-image-preview',
        input: history,
        response_modalities: ['image', 'text'],
        system_instruction: imageGenerationSystemInstruction,
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
      ) || { text: '' }

      const parsedText = cleanGeminiMessage(parsedResponse.text).trim()
      if (parsedText) {
        fallbackText = parsedText
      }

      if (parsedResponse?.image) {
        return {
          image: parsedResponse.image,
          text: parsedText || undefined,
        }
      }

      console.warn(
        `Gemini image generation attempt ${attempt}/${maxRetries} failed - no image in response`,
        JSON.stringify({
          hasText: Boolean(parsedText),
          parsedText,
          outputs: interaction.outputs,
        }),
      )
    }

    if (!fallbackText) {
      console.error('Error empty gemini response after all retries')
      return { text: EMPTY_RESPONSE_ERROR, image: null }
    }

    return { text: fallbackText }
  } catch (error) {
    console.error('Error generating gemini image:', error)
    return { text: error.message || DEFAULT_ERROR_MESSAGE }
  }
}
