import {
  generateImage as generateAiImage,
  generateText,
  type ModelMessage,
  type ToolSet,
} from 'ai'
import type { Message } from 'telegram-typings'

import {
  type AiReasoningEffort,
  buildImageEditTargetPrompt,
  buildOpenAiImagePrompt,
  type CommandImageInput,
  collectHistoryMediaFileRefs,
  DEFAULT_ERROR_MESSAGE,
  formatHistoryForDisplay,
  getAiSdkGoogleTools,
  getAiSdkLanguageModel,
  getAiSdkOpenAiImageModel,
  getAiSdkOpenAiImageSize,
  getAiSdkOpenAiTools,
  getAiSdkProviderOptions,
  getRawHistory,
  isAiEnabledChat,
  isOpenAiGptImageModel,
  logger,
  MAX_HISTORY_IMAGE_ATTACHMENTS,
  MAX_HISTORY_IMAGE_INLINE_BYTES,
  MULTIMODAL_TIMEOUT_MS,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  parseAiModelConfig,
  resolveHistoryMediaAttachments,
  systemInstructions,
  usesOpenAiMediumImageQuality,
} from '@tg-bot/common'

export type SupportedImageModel = string
export type SupportedTextModel = string
export type OpenAiReasoningEffort = AiReasoningEffort

type HistoryMediaApi = {
  getFile: (fileId: string) => Promise<{ file_path?: string }>
}

type GenerateMultimodalCompletionContext = {
  message?: Message
  imageInputs?: CommandImageInput[]
  api?: HistoryMediaApi
}

const OPENAI_HISTORY_LIMIT = 40
const openAiMultimodalInstructions = `${systemInstructions}
  - IMPORTANT: This OpenAI command has web search enabled. Use it for current, uncertain, ambiguous, newly released, or possibly misspelled real-world facts.
  - IMPORTANT: If the user includes or asks about a URL, use web search/open-page behavior to inspect the referenced page before answering. Treat retrieved page/search evidence as stronger than memory.
`

type AiSdkContent = Array<
  | { type: 'text'; text: string }
  | { type: 'image'; image: Buffer; mediaType: string }
>

function getMessageText(message: Message | undefined): string {
  return (message?.caption || message?.text || '').trim()
}

function getMessageSourceLabel(message: Message | undefined): string {
  const parts = [
    typeof message?.message_id === 'number'
      ? `message_id=${message.message_id}`
      : undefined,
    getMessageText(message)
      ? `text=${JSON.stringify(getMessageText(message).slice(0, 180))}`
      : undefined,
  ].filter(Boolean)

  return parts.length ? parts.join(' | ') : 'message metadata unavailable'
}

function pushImageContent(
  content: AiSdkContent,
  label: string,
  data: Buffer,
  mimeType: string,
) {
  content.push({ type: 'text', text: label })
  content.push({
    type: 'image',
    image: data,
    mediaType: mimeType,
  })
}

function getFallbackImageInputs(
  imagesData: Buffer[] = [],
): CommandImageInput[] {
  return imagesData.map((data, index) => ({
    data,
    label: `Request image ${index + 1} (current command, reply, or album media; source label unavailable)`,
    mimeType: 'image/jpeg',
    fileId: '',
  }))
}

async function getHistoryContextContent(
  message: Message | undefined,
  api: HistoryMediaApi | undefined,
  excludedImages: CommandImageInput[] = [],
): Promise<AiSdkContent> {
  const chatId = message?.chat?.id
  if (!chatId) {
    return []
  }

  const rawHistory = await getRawHistory(chatId)
  const content: AiSdkContent = []
  const formattedHistory = formatHistoryForDisplay(rawHistory, {
    limit: OPENAI_HISTORY_LIMIT,
    excludeMessageId: message.message_id,
    headerLabel: 'Recent Telegram chat history',
  })

  if (formattedHistory !== 'No message history available') {
    content.push({
      type: 'text',
      text: [
        'Telegram context below is recent chat history, oldest to newest.',
        'It is background only; do not quote it unless needed.',
        formattedHistory,
      ].join('\n'),
    })
  }

  if (!api) {
    return content
  }

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
    limit: OPENAI_HISTORY_LIMIT,
    mediaTypes: ['image'],
  })

  if (historyImageRefs.length === 0) {
    return content
  }

  const attachments = await resolveHistoryMediaAttachments(
    historyImageRefs,
    api,
  )
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

  selected.forEach(({ message: sourceMessage, media }, index) => {
    pushImageContent(
      content,
      `History image ${index + 1}/${selected.length} (recent chat history | ${getMessageSourceLabel(sourceMessage)})`,
      media.buffer,
      media.mimeType,
    )
  })

  return content
}

function getCurrentCommandText(prompt: string, message: Message | undefined) {
  return [
    'Current command. Answer this, using the labeled media above when relevant.',
    'Media priority: reply/current/album media is intentional request media; history images are background. If the user refers to media and the current Telegram message is a reply, inspect reply media first. If the user asks about the "last photo" and no reply/current media is provided, use the newest history image.',
    `Command text: ${prompt || 'Give a natural short comment about the provided media/context.'}`,
    message
      ? `Current Telegram message: ${getMessageSourceLabel(message)}`
      : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

function getMultimodalTools(provider: string): ToolSet {
  if (provider === 'google') {
    const googleTools = getAiSdkGoogleTools()
    return {
      google_search: googleTools.googleSearch({}),
      url_context: googleTools.urlContext({}),
    }
  }

  return {
    web_search: getAiSdkOpenAiTools().webSearch({ searchContextSize: 'high' }),
  }
}

export const generateImage = async (
  prompt: string,
  chatId: string | number,
  model: SupportedImageModel,
  imagesData?: Buffer[],
  imageInputs?: CommandImageInput[],
): Promise<{ image: string | Buffer; text?: string }> => {
  if (!isAiEnabledChat(chatId)) {
    throw new Error(NOT_ALLOWED_ERROR)
  }
  if (!prompt) {
    throw new Error(PROMPT_MISSING_ERROR)
  }

  const isGptImageModel = isOpenAiGptImageModel(model)
  const requestImages = imageInputs?.length
    ? imageInputs
    : getFallbackImageInputs(imagesData)
  const requestPrompt = isGptImageModel
    ? buildOpenAiImagePrompt(
        buildImageEditTargetPrompt(
          prompt,
          requestImages.map(({ label }) => label),
        ),
      )
    : buildImageEditTargetPrompt(
        prompt,
        requestImages.map(({ label }) => label),
      )

  const maxRetries = 3
  let lastError: Error | undefined

  const toError = (error: unknown) =>
    error instanceof Error ? error : new Error(String(error))

  const imagePrompt =
    requestImages.length && isGptImageModel
      ? {
          text: requestPrompt,
          images: requestImages.map(({ data }) => data),
        }
      : requestPrompt
  const imageSize = isGptImageModel
    ? getAiSdkOpenAiImageSize()
    : ('1024x1024' as const)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await generateAiImage({
        model: getAiSdkOpenAiImageModel(model),
        prompt: imagePrompt,
        n: 1,
        ...(imageSize ? { size: imageSize } : {}),
        maxRetries: 0,
        providerOptions: {
          openai: {
            quality: usesOpenAiMediumImageQuality(model)
              ? 'medium'
              : 'standard',
          },
        },
      })

      if (response.image?.uint8Array) {
        return {
          image: Buffer.from(response.image.uint8Array),
        }
      }

      logger.warn(
        {
          metadata: {
            warnings: response.warnings,
            imageCount: response.images.length,
          },
        },
        `OpenAI image generation attempt ${attempt}/${maxRetries} failed - no image in response`,
      )
    } catch (error) {
      const err = toError(error)
      lastError = err
      logger.warn(
        {
          err,
        },
        `OpenAI image generation attempt ${attempt}/${maxRetries} failed`,
      )
    }
  }

  if (lastError) {
    logger.error(
      { error: lastError },
      'OpenAI image generation failed after all retries',
    )
    throw new Error(lastError.message || DEFAULT_ERROR_MESSAGE)
  }

  logger.error(
    'OpenAI image generation failed after all retries - empty response',
  )
  throw new Error('OpenAI returned empty response, please try again')
}

export const generateMultimodalCompletion = async (
  prompt: string,
  chatId: string | number,
  model: SupportedTextModel,
  imagesData?: Buffer[],
  reasoningEffort: OpenAiReasoningEffort = 'medium',
  context: GenerateMultimodalCompletionContext = {},
) => {
  try {
    if (!isAiEnabledChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }
    const requestImages = context.imageInputs?.length
      ? context.imageInputs
      : getFallbackImageInputs(imagesData)

    if (!prompt && requestImages.length === 0) {
      return PROMPT_MISSING_ERROR
    }

    const content: AiSdkContent = await getHistoryContextContent(
      context.message,
      context.api,
      requestImages,
    ).catch((error) => {
      logger.warn({ error }, 'getHistoryContextContent error')
      return []
    })

    for (const image of requestImages) {
      pushImageContent(content, image.label, image.data, image.mimeType)
    }

    content.push({
      type: 'text',
      text: getCurrentCommandText(prompt, context.message),
    })

    const modelConfig = parseAiModelConfig(model, {
      provider: 'openai',
      model,
    })
    const messages: ModelMessage[] = [{ role: 'user', content }]

    const response = await generateText({
      model: getAiSdkLanguageModel(modelConfig),
      system: openAiMultimodalInstructions,
      messages,
      tools: getMultimodalTools(modelConfig.provider),
      toolChoice: 'auto',
      maxRetries: 0,
      timeout: MULTIMODAL_TIMEOUT_MS,
      providerOptions: getAiSdkProviderOptions(modelConfig, {
        reasoningEffort,
        chatId,
        store: false,
        serviceTier: modelConfig.provider === 'google' ? 'priority' : undefined,
      }),
    })

    if (!response.text) {
      return DEFAULT_ERROR_MESSAGE
    }

    return response.text
  } catch (error) {
    logger.error({ error }, 'generateMultimodalCompletion error')
    return DEFAULT_ERROR_MESSAGE
  }
}
