import OpenAi from 'openai'
import { toFile, type Uploadable } from 'openai/uploads'
import type {
  ChatCompletionContentPart,
  ChatModel,
  ImageModel,
} from 'openai/resources'

import {
  buildOpenAiImagePrompt,
  DEFAULT_ERROR_MESSAGE,
  isAiEnabledChat,
  logger,
  NOT_ALLOWED_ERROR,
  OPENAI_GPT_IMAGE_SIZE,
  PROMPT_MISSING_ERROR,
  systemInstructions,
} from '@tg-bot/common'

let openAiClient: OpenAi | null = null

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

export const generateImage = async (
  prompt: string,
  chatId: string | number,
  model: ImageModel,
  imagesData?: Buffer[],
): Promise<{ image: string | Buffer; text?: string }> => {
  if (!isAiEnabledChat(chatId)) {
    throw new Error(NOT_ALLOWED_ERROR)
  }
  if (!prompt) {
    throw new Error(PROMPT_MISSING_ERROR)
  }

  const openAi = getOpenAiClient()
  const isGptImageModel = model.startsWith('gpt-image-')
  const requestPrompt = isGptImageModel
    ? buildOpenAiImagePrompt(prompt)
    : prompt

  const maxRetries = 3
  let lastError: Error | undefined

  const requestImage = async (): Promise<OpenAi.Images.ImagesResponse> => {
    if (imagesData?.length && model === 'gpt-image-1.5') {
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
      quality: model === 'gpt-image-1.5' ? 'medium' : 'standard',
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
          metadata: JSON.stringify({
            hasB64: Boolean(imageData?.b64_json),
            hasUrl: Boolean(imageData?.url),
            revised_prompt: imageData?.revised_prompt,
          }),
        },
        `OpenAI image generation attempt ${attempt}/${maxRetries} failed - no image in response`,
      )
    } catch (error) {
      lastError = error as Error
      logger.warn(
        {
          error:
            error instanceof Error
              ? error.message
              : JSON.stringify(error, null, 2),
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
  model: ChatModel,
  imagesData?: Buffer[],
) => {
  try {
    if (!isAiEnabledChat(chatId)) {
      return NOT_ALLOWED_ERROR
    }
    if (!prompt && !imagesData?.length) {
      return PROMPT_MISSING_ERROR
    }

    const openAi = getOpenAiClient()

    const content: ChatCompletionContentPart[] = [
      { type: 'text', text: prompt },
    ]

    for (const image of imagesData ?? []) {
      content.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${image.toString('base64')}`,
        },
      })
    }

    const completion = await openAi.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemInstructions,
        },
        {
          role: 'user',
          content,
        },
      ],
      user: String(chatId),
    })
    const { message } = completion.choices[0]

    if (!message?.content) {
      return DEFAULT_ERROR_MESSAGE
    }

    return message.content
  } catch (error) {
    logger.error({ error }, 'generateMultimodalCompletion error')
    return DEFAULT_ERROR_MESSAGE
  }
}
