import OpenAi from 'openai'
import { toFile, type Uploadable } from 'openai/uploads'
import type {
  ResponseCreateParamsNonStreaming,
  ResponseInputContent,
  ResponseInputItem,
  Tool,
} from 'openai/resources/responses/responses'
import type { Message } from 'telegram-typings'

import {
  buildOpenAiImagePrompt,
  type CommandImageInput,
  collectHistoryMediaFileRefs,
  DEFAULT_ERROR_MESSAGE,
  formatHistoryForDisplay,
  getRawHistory,
  isAiEnabledChat,
  isOpenAiGptImageModel,
  logger,
  MAX_HISTORY_IMAGE_ATTACHMENTS,
  MAX_HISTORY_IMAGE_INLINE_BYTES,
  MULTIMODAL_TIMEOUT_MS,
  NOT_ALLOWED_ERROR,
  OPENAI_GPT_IMAGE_SIZE,
  PROMPT_MISSING_ERROR,
  resolveHistoryMediaAttachments,
  systemInstructions,
  usesOpenAiMediumImageQuality,
} from '@tg-bot/common'

export type SupportedImageModel = NonNullable<
  OpenAi.Images.ImageGenerateParams['model']
>
export type SupportedTextModel = NonNullable<
  ResponseCreateParamsNonStreaming['model']
>
export type OpenAiReasoningEffort = NonNullable<
  NonNullable<ResponseCreateParamsNonStreaming['reasoning']>['effort']
>

type HistoryMediaApi = {
  getFile: (fileId: string) => Promise<{ file_path?: string }>
}

type GenerateMultimodalCompletionContext = {
  message?: Message
  imageInputs?: CommandImageInput[]
  api?: HistoryMediaApi
}

let openAiClient: OpenAi | null = null

const OPENAI_HISTORY_LIMIT = 40
const OPENAI_MULTIMODAL_TOOLS: Tool[] = [
  { type: 'web_search', search_context_size: 'high' },
]
const openAiMultimodalInstructions = `${systemInstructions}
  - IMPORTANT: /o has OpenAI web search enabled. Use it for current, uncertain, ambiguous, newly released, or possibly misspelled real-world facts.
  - IMPORTANT: If the user includes or asks about a URL, use web search/open-page behavior to inspect the referenced page before answering. Treat retrieved page/search evidence as stronger than memory.
`

function getOpenAiClient(): OpenAi {
  if (openAiClient) {
    return openAiClient
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set')
  }

  openAiClient = new OpenAi({ apiKey })
  return openAiClient
}

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
  content: ResponseInputContent[],
  label: string,
  data: Buffer,
  mimeType: string,
) {
  content.push({ type: 'input_text', text: label })
  content.push({
    type: 'input_image',
    image_url: `data:${mimeType};base64,${data.toString('base64')}`,
    detail: 'high',
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
): Promise<ResponseInputContent[]> {
  const chatId = message?.chat?.id
  if (!chatId) {
    return []
  }

  const rawHistory = await getRawHistory(chatId)
  const content: ResponseInputContent[] = []
  const formattedHistory = formatHistoryForDisplay(rawHistory, {
    limit: OPENAI_HISTORY_LIMIT,
    excludeMessageId: message.message_id,
    headerLabel: 'Recent Telegram chat history',
  })

  if (formattedHistory !== 'No message history available') {
    content.push({
      type: 'input_text',
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

export const generateImage = async (
  prompt: string,
  chatId: string | number,
  model: SupportedImageModel,
  imagesData?: Buffer[],
): Promise<{ image: string | Buffer; text?: string }> => {
  if (!isAiEnabledChat(chatId)) {
    throw new Error(NOT_ALLOWED_ERROR)
  }
  if (!prompt) {
    throw new Error(PROMPT_MISSING_ERROR)
  }

  const openAi = getOpenAiClient()
  const isGptImageModel = isOpenAiGptImageModel(model)
  const requestPrompt = isGptImageModel
    ? buildOpenAiImagePrompt(prompt)
    : prompt

  const maxRetries = 3
  let lastError: Error | undefined

  const toError = (error: unknown) =>
    error instanceof Error ? error : new Error(String(error))

  const requestImage = async (): Promise<OpenAi.Images.ImagesResponse> => {
    if (imagesData?.length && isGptImageModel) {
      const image: Uploadable[] = []
      for (const imageData of imagesData) {
        image.push(await toFile(imageData, 'image.jpg', { type: 'image/jpeg' }))
      }

      return openAi.images.edit({
        prompt: requestPrompt,
        quality: 'medium',
        model,
        image,
        n: 1,
        size: OPENAI_GPT_IMAGE_SIZE,
      })
    }

    return openAi.images.generate({
      prompt: requestPrompt,
      quality: usesOpenAiMediumImageQuality(model) ? 'medium' : 'standard',
      model,
      n: 1,
      size: isGptImageModel ? OPENAI_GPT_IMAGE_SIZE : '1024x1024',
    })
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await requestImage()
      const imageData = response.data?.[0]
      const text = imageData?.revised_prompt

      if (imageData?.b64_json) {
        return {
          image: Buffer.from(imageData.b64_json, 'base64'),
          text,
        }
      }

      if (imageData?.url) {
        return { image: imageData.url, text }
      }

      logger.warn(
        {
          metadata: {
            hasB64: Boolean(imageData?.b64_json),
            hasUrl: Boolean(imageData?.url),
            revised_prompt: imageData?.revised_prompt,
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

    const openAi = getOpenAiClient()

    const content: ResponseInputContent[] = await getHistoryContextContent(
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
      type: 'input_text',
      text: getCurrentCommandText(prompt, context.message),
    })

    const input: ResponseInputItem[] = [{ role: 'user', content }]

    const response = await openAi.responses.create(
      {
        model,
        instructions: openAiMultimodalInstructions,
        input,
        tools: OPENAI_MULTIMODAL_TOOLS,
        tool_choice: 'auto',
        include: ['web_search_call.action.sources'],
        reasoning: { effort: reasoningEffort },
        safety_identifier: String(chatId),
        store: false,
      },
      {
        timeout: MULTIMODAL_TIMEOUT_MS,
        maxRetries: 0,
      },
    )

    if (!response.output_text) {
      return DEFAULT_ERROR_MESSAGE
    }

    return response.output_text
  } catch (error) {
    logger.error({ error }, 'generateMultimodalCompletion error')
    return DEFAULT_ERROR_MESSAGE
  }
}
