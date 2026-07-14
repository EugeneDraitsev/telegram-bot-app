import { generateImage } from 'ai'

import {
  type AiModelConfig,
  GEMINI_FLASH_LITE_IMAGE_MODEL,
} from './ai-model.utils'
import { getAiSdkGoogleProvider } from './ai-sdk.utils'

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
  readonly aspectRatio?: GeminiImageAspectRatio
  readonly model?: AiModelConfig
  readonly timeoutMs?: number
}

export async function generateGeminiImage(
  prompt: string,
  inputImages?: Buffer[],
  {
    aspectRatio,
    model = GEMINI_FLASH_LITE_IMAGE_MODEL,
    timeoutMs = 60_000,
  }: GenerateGeminiImageOptions = {},
): Promise<{ image?: Buffer; text?: string }> {
  if (model.provider !== 'google') {
    throw new Error('Gemini image generation requires a Google model')
  }

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
