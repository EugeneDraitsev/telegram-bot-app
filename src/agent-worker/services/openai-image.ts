/**
 * OpenAI Image Generation & Editing Service
 *
 * Change IMAGE_MODEL to switch the underlying model.
 */

import { toFile, type Uploadable } from 'openai/uploads'
import type OpenAi from 'openai'

import {
  buildOpenAiImagePrompt,
  isOpenAiGptImageModel,
  logger,
  OPENAI_GPT_IMAGE_MODEL,
  OPENAI_GPT_IMAGE_SIZE,
  usesOpenAiMediumImageQuality,
} from '@tg-bot/common'
import { getOpenAiClient } from './openai-client'

type SupportedImageModel = NonNullable<
  OpenAi.Images.ImageGenerateParams['model']
>

/** Model used by the generate_or_edit_image agent tool */
export const IMAGE_MODEL: SupportedImageModel = OPENAI_GPT_IMAGE_MODEL

const MAX_RETRIES = 3

export async function generateImageOpenAi(
  prompt: string,
  inputImages?: Buffer[],
): Promise<{ image?: Buffer; text?: string }> {
  const openAi = getOpenAiClient()
  const requestPrompt = buildOpenAiImagePrompt(prompt)

  const requestImage = async (): Promise<OpenAi.Images.ImagesResponse> => {
    if (inputImages?.length && isOpenAiGptImageModel(IMAGE_MODEL)) {
      const images: Uploadable[] = []
      for (const buf of inputImages) {
        images.push(await toFile(buf, 'image.jpg', { type: 'image/jpeg' }))
      }

      return openAi.images.edit({
        prompt: requestPrompt,
        model: IMAGE_MODEL,
        image: images,
        quality: 'medium',
        n: 1,
        size: OPENAI_GPT_IMAGE_SIZE,
      })
    }

    return openAi.images.generate({
      prompt: requestPrompt,
      model: IMAGE_MODEL,
      quality: usesOpenAiMediumImageQuality(IMAGE_MODEL)
        ? 'medium'
        : 'standard',
      n: 1,
      size: OPENAI_GPT_IMAGE_SIZE,
    })
  }

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await requestImage()
      const data = response.data?.[0]

      if (data?.b64_json) {
        return {
          image: Buffer.from(data.b64_json, 'base64'),
          text: data.revised_prompt,
        }
      }

      logger.warn({ attempt, maxRetries: MAX_RETRIES }, 'openai_image.no_image')
    } catch (error) {
      lastError = error as Error
      logger.warn(
        { attempt, maxRetries: MAX_RETRIES, error: (error as Error).message },
        'openai_image.attempt_failed',
      )
    }
  }

  if (lastError) {
    throw lastError
  }

  return {}
}
