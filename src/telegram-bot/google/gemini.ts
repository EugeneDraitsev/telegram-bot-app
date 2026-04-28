import {
  type Content,
  type GenerateContentParameters,
  type GenerateContentResponse,
  GoogleGenAI,
  type ServiceTier,
} from '@google/genai'
import type { Message } from 'telegram-typings'

import {
  type CommandImageInput,
  cleanGeminiMessage,
  collectHistoryMediaFileRefs,
  DEFAULT_ERROR_MESSAGE,
  EMPTY_RESPONSE_ERROR,
  GEMINI_SERVICE_TIER,
  geminiSystemInstructions,
  gemmaSystemInstructions,
  getHistory,
  getRawHistory,
  isAiEnabledChat,
  logger,
  MAX_HISTORY_IMAGE_ATTACHMENTS,
  MAX_HISTORY_IMAGE_INLINE_BYTES,
  MULTIMODAL_TIMEOUT_MS,
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

type InteractionRequestOptions = {
  timeout?: number
  maxRetries?: number
}

type CreateInteraction = (
  request: Record<string, unknown>,
  options?: InteractionRequestOptions,
) => Promise<InteractionResponse>

type CreateContent = (
  request: GenerateContentParameters,
) => Promise<GenerateContentResponse>

type HistoryMediaApi = {
  getFile: (fileId: string) => Promise<{ file_path?: string }>
}

interface GenerateMultimodalCompletionOptions {
  prompt: string
  message?: Message
  imagesData?: Buffer[]
  imageInputs?: CommandImageInput[]
  model?: string
  createContent?: CreateContent
  api?: HistoryMediaApi
}

const createGeminiInteraction: CreateInteraction = (request, options) =>
  ai.interactions.create(
    {
      ...request,
      service_tier: GEMINI_SERVICE_TIER,
    } as never,
    options as never,
  ) as Promise<InteractionResponse>

const createGeminiContent: CreateContent = (request) =>
  ai.models.generateContent(request)

function getHistoryImagePrompt(message: Message): string {
  const sourceText = (message.caption || message.text || '').trim()
  return sourceText
    ? `Context image from recent chat history. Related message text: ${sourceText.slice(0, 200)}`
    : 'Context image from recent chat history.'
}

async function getHistoryImageInputs(
  message: Message | undefined,
  api: HistoryMediaApi | undefined,
  excludedImages: CommandImageInput[] = [],
): Promise<InteractionInput[]> {
  const chatId = message?.chat?.id
  if (!chatId || !api) {
    return []
  }

  const rawHistory = await getRawHistory(chatId)
  const excludeFileIds = new Set(
    excludedImages.map(({ fileId }) => fileId).filter(Boolean),
  )
  const excludeFileUniqueIds = new Set(
    excludedImages
      .map(({ fileUniqueId }) => fileUniqueId)
      .filter((id): id is string => Boolean(id)),
  )
  const historyImageRefs = collectHistoryMediaFileRefs(rawHistory, {
    excludeMessageId: message.message_id,
    excludeFileIds,
    excludeFileUniqueIds,
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

    if (selected.length >= MAX_HISTORY_IMAGE_ATTACHMENTS) {
      break
    }
    if (!attachment) {
      continue
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

function toGenerateContentInputs(inputs: InteractionInput[]): Content[] {
  return inputs.map(({ role, content }) => ({
    role,
    parts: content.map((part) =>
      part.type === 'text'
        ? { text: part.text }
        : {
            inlineData: {
              data: part.data,
              mimeType: part.mime_type,
            },
          },
    ),
  }))
}

export const generateMultimodalCompletion = async ({
  prompt,
  message,
  imagesData,
  imageInputs,
  model = 'gemini-3.1-flash-lite-preview',
  createContent = createGeminiContent,
  api,
}: GenerateMultimodalCompletionOptions) => {
  try {
    const isGemmaModel = model.includes('gemma')
    const chatId = message?.chat?.id
    if (!chatId || !isAiEnabledChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }

    const history = (await getHistory(chatId)) as InteractionInput[]
    const requestImages = imageInputs?.length
      ? imageInputs
      : (imagesData ?? []).map((data, index) => ({
          data,
          label: `Request image ${index + 1} (current command, reply, or album media; source label unavailable)`,
          mimeType: 'image/jpeg',
          fileId: '',
        }))
    const historyImageInputs = await getHistoryImageInputs(
      message,
      api,
      requestImages,
    ).catch((error) => {
      logger.warn({ error }, 'getHistoryImageInputs error')
      return [] as InteractionInput[]
    })

    // Add a placeholder for the first message if the first message is from the model
    if (history?.[0]?.role === 'model') {
      history?.unshift({
        role: 'user',
        content: [{ type: 'text', text: '...' }],
      })
    }

    history.push(...historyImageInputs)

    // Add images to history
    for (const image of requestImages) {
      history.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: image.label,
          },
          {
            type: 'image',
            data: image.data.toString('base64'),
            mime_type: image.mimeType,
          },
        ],
      })
    }

    history.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Media priority: reply/current/album media is intentional request media; history images are background. If the user refers to media and the current Telegram message is a reply, inspect reply media first.',
        },
      ],
    })

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

    const response = await createContent({
      model,
      contents: toGenerateContentInputs(history),
      config: {
        systemInstruction: isGemmaModel
          ? gemmaSystemInstructions
          : geminiSystemInstructions,
        serviceTier: GEMINI_SERVICE_TIER as ServiceTier,
        httpOptions: {
          timeout: MULTIMODAL_TIMEOUT_MS,
          retryOptions: { attempts: 1 },
        },
        ...(!isGemmaModel
          ? {
              tools: [{ googleSearch: {} }, { urlContext: {} }],
            }
          : {}),
      },
    })

    const text = response.text

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
        service_tier: GEMINI_SERVICE_TIER,
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
          metadata: {
            hasText: Boolean(parsedText),
            parsedText,
            outputs: interaction.outputs,
          },
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
