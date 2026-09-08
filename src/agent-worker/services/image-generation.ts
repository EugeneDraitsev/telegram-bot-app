import { generateImage } from 'ai'

import {
  buildImageGenerationPrompt,
  formatAiModelConfig,
  GEMINI_FLASH_LITE_IMAGE_MODEL,
  generateGeminiImage,
  getAiSdkOpenAiImageModel,
  getErrorMessage,
  logger,
} from '@tg-bot/common'
import { trackToolModelCall } from '../tools/context'

const FLARE = {
  provider: 'openai',
  model: 'gpt-image-2.5-flare',
  quality: 'low',
} as const
const SUNBURST = {
  provider: 'openai',
  model: 'gpt-image-2.5-sunburst',
  quality: 'medium',
} as const

type ImageModel =
  | typeof FLARE
  | typeof SUNBURST
  | typeof GEMINI_FLASH_LITE_IMAGE_MODEL

const IMAGE_ATTEMPT_TIMEOUT_MS = 55_000
export const IMAGE_TOOL_TIMEOUT_MS = IMAGE_ATTEMPT_TIMEOUT_MS * 2 + 10_000

function getImageModels(commandName?: string): [ImageModel, ImageModel?] {
  switch (commandName) {
    case 'e':
    case 'ee':
    case 'gp':
    case 'de':
      return [SUNBURST]
    case 'ge':
      return [GEMINI_FLASH_LITE_IMAGE_MODEL]
    default:
      return [GEMINI_FLASH_LITE_IMAGE_MODEL, FLARE]
  }
}

function generateWithModel(
  model: ImageModel,
  prompt: string,
  inputImages: Buffer[] | undefined,
  timeoutMs: number,
  fallbackFrom?: string,
): Promise<Buffer> {
  return trackToolModelCall(
    {
      name: 'image_generation',
      model: formatAiModelConfig(model),
      fallbackFrom,
    },
    async () => {
      let image: Buffer | undefined
      if (model.provider === 'google') {
        const result = await generateGeminiImage(prompt, inputImages, {
          timeoutMs,
        })
        image = result.image
      } else {
        const result = await generateImage({
          model: getAiSdkOpenAiImageModel(model.model),
          prompt: inputImages?.length
            ? { text: prompt, images: inputImages }
            : prompt,
          n: 1,
          maxRetries: 0,
          abortSignal: AbortSignal.timeout(timeoutMs),
          providerOptions: { openai: { quality: model.quality } },
        })
        if (result.image?.uint8Array)
          image = Buffer.from(result.image.uint8Array)
      }
      if (!image?.length) {
        throw new Error(`${formatAiModelConfig(model)} returned no image`)
      }
      return image
    },
  )
}

export async function generateAgentImage(
  prompt: string,
  inputImages?: Buffer[],
  commandName?: string,
): Promise<Buffer> {
  const [primary, fallback] = getImageModels(commandName)
  const imagePrompt = buildImageGenerationPrompt(prompt)
  // Reserve time for the fallback; explicit commands get the full request budget.
  const timeoutMs = fallback
    ? IMAGE_ATTEMPT_TIMEOUT_MS
    : IMAGE_ATTEMPT_TIMEOUT_MS * 2
  try {
    return await generateWithModel(primary, imagePrompt, inputImages, timeoutMs)
  } catch (error) {
    if (!fallback) throw error
    const fallbackFrom = formatAiModelConfig(primary)
    logger.warn(
      {
        model: formatAiModelConfig(fallback),
        fallbackFrom,
        error: getErrorMessage(error),
      },
      'image_gen.fallback',
    )
    return generateWithModel(
      fallback,
      imagePrompt,
      inputImages,
      timeoutMs,
      fallbackFrom,
    )
  }
}
