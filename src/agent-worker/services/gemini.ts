/**
 * Google-backed image generation through AI SDK.
 */

import { generateText, type ModelMessage } from 'ai'

import {
  GEMINI_FLASH_IMAGE_MODEL,
  getAiSdkLanguageModel,
  logger,
} from '@tg-bot/common'

const IMAGE_GENERATION_TIMEOUT_MS = 120_000

/**
 * Generate image with optional text response.
 * Uses the Interactions API with Gemini 3.1 Flash Image.
 */
export async function generateImage(
  prompt: string,
  inputImages?: Buffer[],
): Promise<{ image?: Buffer; text?: string }> {
  const messages: ModelMessage[] = []

  if (inputImages?.length) {
    for (const image of inputImages) {
      messages.push({
        role: 'user',
        content: [
          {
            type: 'image',
            image,
            mediaType: 'image/jpeg',
          },
        ],
      })
    }
  }

  messages.push({
    role: 'user',
    content: [{ type: 'text', text: prompt }],
  })

  const maxRetries = 3
  let result: { image?: Buffer; text?: string } = {}

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await generateText({
      model: getAiSdkLanguageModel(GEMINI_FLASH_IMAGE_MODEL),
      messages,
      maxRetries: 0,
      timeout: IMAGE_GENERATION_TIMEOUT_MS,
    })

    const imageFile = response.files.find((file) =>
      file.mediaType?.startsWith('image/'),
    )
    result = {
      image: imageFile ? Buffer.from(imageFile.uint8Array) : undefined,
      text: response.text,
    }

    if (result.image) {
      break
    }

    logger.warn({ attempt, maxRetries }, 'image_gen.no_image')
  }

  if (result.text) {
    result.text = cleanResponse(result.text)
  }

  return result
}

/**
 * Clean response text from markdown artifacts.
 */
function cleanResponse(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/__/g, '')
    .replace(/`/g, '')
    .replace(/#{1,6}\s/g, '')
    .trim()
}
