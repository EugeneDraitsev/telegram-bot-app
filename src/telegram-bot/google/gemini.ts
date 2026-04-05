import { GoogleGenAI } from '@google/genai'
import type { Message } from 'telegram-typings'

import {
  cleanGeminiMessage,
  collectHistoryMediaFileRefs,
  DEFAULT_ERROR_MESSAGE,
  EMPTY_RESPONSE_ERROR,
  geminiSystemInstructions,
  gemmaSystemInstructions,
  getHistory,
  getRawHistory,
  isAiEnabledChat,
  logger,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  resolveHistoryMediaAttachments,
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
    | { type: 'image'; data: string; mime_type: string }
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

type HistoryMediaApi = {
  getFile: (fileId: string) => Promise<{ file_path?: string }>
}

interface GenerateMultimodalCompletionOptions {
  prompt: string
  message?: Message
  imagesData?: Buffer[]
  model?: string
  createInteraction?: CreateInteraction
  api?: HistoryMediaApi
}

const MAX_HISTORY_IMAGE_ATTACHMENTS = 8
const MAX_HISTORY_IMAGE_INLINE_BYTES = 12 * 1024 * 1024

const createGeminiInteraction: CreateInteraction = (request) =>
  ai.interactions.create(request as never) as Promise<InteractionResponse>

function getHistoryImagePrompt(message: Message): string {
  const sourceText = (message.caption || message.text || '').trim()
  return sourceText
    ? `Context image from recent chat history. Related message text: ${sourceText.slice(0, 200)}`
    : 'Context image from recent chat history.'
}

async function getHistoryImageInputs(
  message: Message | undefined,
  api: HistoryMediaApi | undefined,
): Promise<InteractionInput[]> {
  const chatId = message?.chat?.id
  if (!chatId || !api) {
    return []
  }

  const rawHistory = await getRawHistory(chatId)
  const historyImageRefs = collectHistoryMediaFileRefs(rawHistory, {
    excludeMessageId: message.message_id,
    mediaTypes: ['image'],
  })

  if (historyImageRefs.length === 0) {
    return []
  }

  const attachments = await resolveHistoryMediaAttachments(
    historyImageRefs,
    api,
  )
  if (attachments.length === 0) {
    return []
  }

  const selected: typeof attachments = []
  let totalBytes = 0

  for (let index = attachments.length - 1; index >= 0; index--) {
    const attachment = attachments[index]
    const size = attachment?.media.buffer.byteLength ?? 0

    if (!attachment || selected.length >= MAX_HISTORY_IMAGE_ATTACHMENTS) {
      break
    }

    if (totalBytes + size > MAX_HISTORY_IMAGE_INLINE_BYTES) {
      continue
    }

    totalBytes += size
    selected.unshift(attachment)
  }

  return selected.map(({ message: sourceMessage, media }) => ({
    role: 'user',
    content: [
      { type: 'text', text: getHistoryImagePrompt(sourceMessage) },
      {
        type: 'image',
        data: media.buffer.toString('base64'),
        mime_type: media.mimeType,
      },
    ],
  }))
}

export const generateMultimodalCompletion = async ({
  prompt,
  message,
  imagesData,
  model = 'gemini-3.1-flash-lite-preview',
  createInteraction = createGeminiInteraction,
  api,
}: GenerateMultimodalCompletionOptions) => {
  try {
    const isGemmaModel = model.includes('gemma')
    const chatId = message?.chat?.id
    if (!chatId || !isAiEnabledChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }

    const history = (await getHistory(chatId)) as InteractionInput[]
    const historyImageInputs = await getHistoryImageInputs(message, api).catch(
      (error) => {
        logger.warn({ error }, 'getHistoryImageInputs error')
        return [] as InteractionInput[]
      },
    )

    // Add a placeholder for the first message if the first message is from the model
    if (history?.[0]?.role === 'model') {
      history?.unshift({
        role: 'user',
        content: [{ type: 'text', text: '...' }],
      })
    }

    history.push(...historyImageInputs)

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
      system_instruction: isGemmaModel
        ? gemmaSystemInstructions
        : geminiSystemInstructions,
      ...(!isGemmaModel
        ? {
            tools: [{ type: 'google_search' }, { type: 'url_context' }],
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
    logger.error({ error }, 'gemini generateMultimodalCompletion error')
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

      logger.warn(
        {
          metadata: JSON.stringify({
            hasText: Boolean(parsedText),
            parsedText,
            outputs: interaction.outputs,
          }),
        },
        `Gemini image generation attempt ${attempt}/${maxRetries} failed - no image in response`,
      )
    }

    if (!fallbackText) {
      logger.error('Error empty gemini response after all retries')
      return { text: EMPTY_RESPONSE_ERROR, image: null }
    }

    return { text: fallbackText }
  } catch (error) {
    logger.error({ error }, 'Error generating gemini image')
    return {
      text: error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE,
    }
  }
}
