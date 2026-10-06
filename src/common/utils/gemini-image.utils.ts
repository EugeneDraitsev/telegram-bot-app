import { generateImage } from 'ai'

import type { AiModelConfig } from './ai-model.utils'
import { getAiSdkGoogleProvider } from './ai-sdk.utils'

/** Shared by agent images and the currency background. */
export const GEMINI_FLASH_LITE_IMAGE_MODEL = {
  provider: 'google',
  model: 'gemini-3.1-flash-lite-image',
} as const satisfies AiModelConfig

export const GEMINI_NANO_BANANA_IMAGE_MODEL = {
  provider: 'google',
  model: 'gemini-nano-banana-2.1',
} as const satisfies AiModelConfig

export type GeminiImageModel =
  | typeof GEMINI_FLASH_LITE_IMAGE_MODEL
  | typeof GEMINI_NANO_BANANA_IMAGE_MODEL

export type GeminiImageAspectRatio =
  | '1:1'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:3'
  | '4:5'
  | '5:4'
  | '9:16'
  | '16:9'
  | '21:9'

type GenerateGeminiImageOptions = {
  readonly model?: GeminiImageModel
  readonly aspectRatio?: GeminiImageAspectRatio
  readonly timeoutMs?: number
}

export async function generateGeminiImage(
  prompt: string,
  inputImages?: Buffer[],
  {
    model = GEMINI_FLASH_LITE_IMAGE_MODEL,
    aspectRatio,
    timeoutMs = 60_000,
  }: GenerateGeminiImageOptions = {},
): Promise<{ image: Buffer }> {
  const response = await generateImage({
    model: getAiSdkGoogleProvider().image(model.model),
    prompt: inputImages?.length
      ? { text: prompt, images: inputImages }
      : prompt,
    aspectRatio,
    maxRetries: 0,
    abortSignal: globalThis.AbortSignal.timeout(timeoutMs),
  })

  return {
    image: Buffer.from(response.image.uint8Array),
  }
}
