/**
 * Google-backed image generation through AI SDK.
 */

import { generateGeminiImage, logger } from '@tg-bot/common'

const MAX_IMAGE_ATTEMPTS = 2

/**
 * Generate image with optional text response.
 * Uses the Interactions API with Gemini 3.1 Flash Lite Image.
 */
export async function generateImage(
  prompt: string,
  inputImages?: Buffer[],
): Promise<{ image?: Buffer; text?: string }> {
  let result: { image?: Buffer; text?: string } = {}

  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    result = await generateGeminiImage(prompt, inputImages)

    if (result.image) {
      break
    }

    logger.warn(
      { attempt, maxAttempts: MAX_IMAGE_ATTEMPTS },
      'image_gen.no_image',
    )
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
