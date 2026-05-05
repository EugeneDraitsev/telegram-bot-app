/**
 * OpenAI Image Generation & Editing Service
 *
 * Change IMAGE_MODEL to switch the underlying model.
 */

import { generateImage } from 'ai'

import {
  buildOpenAiImagePrompt,
  getAiSdkOpenAiImageModel,
  getAiSdkOpenAiImageSize,
  isOpenAiGptImageModel,
  logger,
  OPENAI_GPT_IMAGE_MODEL,
  usesOpenAiMediumImageQuality,
} from '@tg-bot/common'

type SupportedImageModel = string

/** Model used by the generate_or_edit_image agent tool */
export const IMAGE_MODEL: SupportedImageModel = OPENAI_GPT_IMAGE_MODEL

const MAX_RETRIES = 3

export async function generateImageOpenAi(
  prompt: string,
  inputImages?: Buffer[],
): Promise<{ image?: Buffer; text?: string }> {
  const requestPrompt = buildOpenAiImagePrompt(prompt)
  const canEdit = Boolean(
    inputImages?.length && isOpenAiGptImageModel(IMAGE_MODEL),
  )
  const imagePrompt = canEdit
    ? { text: requestPrompt, images: inputImages ?? [] }
    : requestPrompt
  const imageSize = getAiSdkOpenAiImageSize()

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await generateImage({
        model: getAiSdkOpenAiImageModel(IMAGE_MODEL),
        prompt: imagePrompt,
        n: 1,
        ...(imageSize ? { size: imageSize } : {}),
        maxRetries: 0,
        providerOptions: {
          openai: {
            quality: usesOpenAiMediumImageQuality(IMAGE_MODEL)
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
        { attempt, maxRetries: MAX_RETRIES, warnings: response.warnings },
        'openai_image.no_image',
      )
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
