import {
  type AssistantModelMessage,
  type GeneratedFile,
  generateText,
  type JSONValue,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UserModelMessage,
} from 'ai'
import type { Message } from 'telegram-typings'

import {
  buildImageEditTargetPrompt,
  type CommandImageInput,
  cleanModelMessage,
  collectHistoryMediaFileRefs,
  DEFAULT_ERROR_MESSAGE,
  EMPTY_RESPONSE_ERROR,
  getAiSdkGoogleTools,
  getAiSdkLanguageModel,
  getHistory,
  getRawHistory,
  isAiEnabledChat,
  logger,
  MAX_HISTORY_IMAGE_ATTACHMENTS,
  MAX_HISTORY_IMAGE_INLINE_BYTES,
  MULTIMODAL_TIMEOUT_MS,
  multimodalSystemInstructions,
  NOT_ALLOWED_ERROR,
  offlineMultimodalSystemInstructions,
  PROMPT_MISSING_ERROR,
  parseAiModelConfig,
  resolveHistoryMediaAttachments,
  systemInstructions,
} from '@tg-bot/common'

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

type TextCompletionRequest = {
  model: LanguageModel
  messages: ModelMessage[]
  system: string
  tools?: ToolSet
  temperature?: number
  maxRetries?: number
  timeout?: number
  providerOptions?: Record<string, Record<string, JSONValue>>
}

type CreateTextCompletion = (
  request: TextCompletionRequest,
) => Promise<{ text?: string }>

type ImageCompletionRequest = {
  model: LanguageModel
  messages: ModelMessage[]
  system: string
  maxRetries?: number
  timeout?: number
  providerOptions?: Record<string, Record<string, JSONValue>>
}

type CreateImageCompletion = (
  request: ImageCompletionRequest,
) => Promise<{ text?: string; files?: GeneratedFile[] }>

type GoogleToolFactories = Pick<
  ReturnType<typeof getAiSdkGoogleTools>,
  'googleSearch' | 'urlContext'
>

type HistoryMediaApi = {
  getFile: (fileId: string) => Promise<{ file_path?: string }>
}

interface GenerateMultimodalCompletionOptions {
  prompt: string
  message?: Message
  imagesData?: Buffer[]
  imageInputs?: CommandImageInput[]
  model?: string
  languageModel?: LanguageModel
  googleTools?: GoogleToolFactories
  createTextCompletion?: CreateTextCompletion
  api?: HistoryMediaApi
}
type UserContentPart = Exclude<UserModelMessage['content'], string>[number]
type AssistantContentPart = Exclude<
  AssistantModelMessage['content'],
  string
>[number]

const createAiSdkTextCompletion: CreateTextCompletion = (request) =>
  generateText(request)

const createAiSdkImageCompletion: CreateImageCompletion = (request) =>
  generateText(request)

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

function toUserContentPart(
  part: InteractionInput['content'][number],
): UserContentPart {
  return part.type === 'text'
    ? { type: 'text', text: part.text }
    : {
        type: 'image',
        image: Buffer.from(part.data, 'base64'),
        mediaType: part.mime_type,
      }
}

function toAssistantContent(
  content: InteractionInput['content'],
): AssistantModelMessage['content'] {
  const textParts: AssistantContentPart[] = content.flatMap((part) =>
    part.type === 'text' ? [{ type: 'text', text: part.text }] : [],
  )

  return textParts.length ? textParts : ''
}

function toModelMessages(inputs: InteractionInput[]): ModelMessage[] {
  return inputs.map(({ role, content }) =>
    role === 'model'
      ? { role: 'assistant', content: toAssistantContent(content) }
      : { role: 'user', content: content.map(toUserContentPart) },
  )
}

export const generateMultimodalCompletion = async ({
  prompt,
  message,
  imagesData,
  imageInputs,
  model = 'gemini-3.1-flash-lite-preview',
  languageModel,
  googleTools: injectedGoogleTools,
  createTextCompletion = createAiSdkTextCompletion,
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

    const modelConfig = parseAiModelConfig(model, {
      provider: 'google',
      model,
    })
    const googleTools =
      !isGemmaModel && modelConfig.provider === 'google'
        ? (injectedGoogleTools ?? getAiSdkGoogleTools())
        : undefined
    const response = await createTextCompletion({
      model: languageModel ?? getAiSdkLanguageModel(modelConfig),
      messages: toModelMessages(history),
      system: isGemmaModel
        ? offlineMultimodalSystemInstructions
        : multimodalSystemInstructions,
      maxRetries: 0,
      timeout: MULTIMODAL_TIMEOUT_MS,
      providerOptions:
        modelConfig.provider === 'google'
          ? { google: { serviceTier: 'priority' } }
          : undefined,
      ...(!isGemmaModel && googleTools
        ? {
            tools: {
              google_search: googleTools.googleSearch({}),
              url_context: googleTools.urlContext({}),
            },
          }
        : {}),
    })

    const text = response.text

    if (!text) {
      return DEFAULT_ERROR_MESSAGE
    }

    return cleanModelMessage(text)
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
  imageInputs?: CommandImageInput[],
  createImageCompletion: CreateImageCompletion = createAiSdkImageCompletion,
) {
  try {
    if (!isAiEnabledChat(chatId)) {
      return { text: NOT_ALLOWED_ERROR }
    }

    const requestImages = imageInputs?.length
      ? imageInputs
      : (imagesData ?? []).map((data, index) => ({
          data,
          label: `Request image ${index + 1} (source label unavailable)`,
          mimeType: 'image/jpeg',
          fileId: '',
        }))

    if (!prompt && !requestImages.length) {
      return { text: PROMPT_MISSING_ERROR }
    }

    // Get message history for context
    const history: InteractionInput[] = [] // await getHistory(chatId)

    // Add images from the current request
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

    // Add current prompt
    if (prompt) {
      history.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: buildImageEditTargetPrompt(
              prompt,
              requestImages.map(({ label }) => label),
            ),
          },
        ],
      })
    }

    const maxRetries = 3
    let fallbackText = ''

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const response = await createImageCompletion({
        model: getAiSdkLanguageModel({
          provider: 'google',
          model: 'gemini-3.1-flash-image-preview',
        }),
        messages: toModelMessages(history),
        system: imageGenerationSystemInstruction,
        maxRetries: 0,
        timeout: MULTIMODAL_TIMEOUT_MS,
        providerOptions: { google: { serviceTier: 'priority' } },
      })

      const imageFile = response.files?.find((file) =>
        file.mediaType?.startsWith('image/'),
      )
      const parsedResponse = {
        text: response.text ?? '',
        image: imageFile ? Buffer.from(imageFile.uint8Array) : undefined,
      }

      const parsedText = cleanModelMessage(parsedResponse.text).trim()
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
            fileCount: response.files?.length ?? 0,
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
