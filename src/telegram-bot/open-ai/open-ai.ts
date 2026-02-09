import OpenAi from 'openai'
import { toFile, type Uploadable } from 'openai/uploads'
import type {
  ChatCompletionContentPart,
  ChatModel,
  ImageModel,
} from 'openai/resources'

import {
  DEFAULT_ERROR_MESSAGE,
  isAiEnabledChat,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
  systemInstructions,
} from '@tg-bot/common'

const openAi = new OpenAi({
  apiKey: process.env.OPENAI_API_KEY,
})

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

  const maxRetries = 3
  let lastError: Error | undefined

  const requestImage = async (): Promise<OpenAi.Images.ImagesResponse> => {
    if (imagesData?.length && model === 'gpt-image-1.5') {
      const image: Uploadable[] = []
      for (const imageData of imagesData) {
        image.push(await toFile(imageData, 'image.jpg', { type: 'image/jpeg' }))
      }

      return openAi.images.edit({
        prompt,
        quality: 'medium',
        model,
        image,
        n: 1,
        size: '1024x1024',
      })
    }

    return openAi.images.generate({
      prompt,
      quality: model === 'gpt-image-1.5' ? 'medium' : 'standard',
      model,
      n: 1,
      size: '1024x1024',
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

      console.warn(
        `OpenAI image generation attempt ${attempt}/${maxRetries} failed - no image in response`,
        JSON.stringify({
          hasB64: Boolean(imageData?.b64_json),
          hasUrl: Boolean(imageData?.url),
          revised_prompt: imageData?.revised_prompt,
        }),
      )
    } catch (error) {
      lastError = error as Error
      console.warn(
        `OpenAI image generation attempt ${attempt}/${maxRetries} failed`,
        error instanceof Error ? error.message : error,
      )
    }
  }

  if (lastError) {
    console.error('OpenAI image generation failed after all retries', lastError)
    throw new Error(lastError.message || DEFAULT_ERROR_MESSAGE)
  }

  console.error(
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
    console.error('generateMultimodalCompletion error: ', error)
    return DEFAULT_ERROR_MESSAGE
  }
}
