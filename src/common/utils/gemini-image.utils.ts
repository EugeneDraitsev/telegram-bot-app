import { generateText, type ModelMessage } from 'ai'

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

  const content: ModelMessage['content'] = [
    ...(inputImages ?? []).map((image) => ({
      type: 'image' as const,
      image,
      mediaType: 'image/jpeg' as const,
    })),
    { type: 'text' as const, text: prompt },
  ]
  const response = await generateText({
    model: getAiSdkGoogleProvider().interactions(model.model),
    messages: [{ role: 'user', content }],
    maxRetries: 0,
    timeout: timeoutMs,
    providerOptions: {
      google: {
        thinkingLevel: 'minimal',
        responseFormat: [
          { type: 'text' },
          {
            type: 'image',
            mimeType: 'image/png',
            imageSize: '1K',
            ...(aspectRatio ? { aspectRatio } : {}),
          },
        ],
      },
    },
  })

  const imageFile = response.files.find((file) =>
    file.mediaType?.startsWith('image/'),
  )

  return {
    image: imageFile ? Buffer.from(imageFile.uint8Array) : undefined,
    text: response.text || undefined,
  }
}
