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
  model: 'gpt-image-2.6-flare',
  quality: 'low',
} as const
const SUNBURST = {
  provider: 'openai',
  model: 'gpt-image-2.6-sunburst',
  quality: 'medium',
} as const
const NANO_BANANA = {
  provider: 'google',
  model: 'gemini-nano-banana-2.1',
} as const

type ImageModel =
  | typeof FLARE
  | typeof SUNBURST
  | typeof NANO_BANANA
  | typeof GEMINI_FLASH_LITE_IMAGE_MODEL

const IMAGE_ATTEMPT_TIMEOUT_MS = 55_000
export const IMAGE_TOOL_TIMEOUT_MS = IMAGE_ATTEMPT_TIMEOUT_MS * 2 + 10_000
// Every GIF frame is rendered, so one animation takes longer than a still.
const GIF_ATTEMPT_TIMEOUT_MS = 160_000
export const GIF_TOOL_TIMEOUT_MS = GIF_ATTEMPT_TIMEOUT_MS + 10_000

function getImageModels(commandName?: string): [ImageModel, ImageModel?] {
  switch (commandName) {
    case 'e':
    case 'ee':
    case 'gp':
    case 'de':
      return [SUNBURST]
    case 'ge':
      return [NANO_BANANA]
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
          model: model.model,
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

/**
 * Animated GIFs come only from the Images API generations endpoint. The AI SDK
 * rejects the `gif` output format, so this request goes to the API directly.
 * The API's defaults (9 frames, 200 ms each) are kept.
 */
export function generateAgentGif(
  prompt: string,
  commandName?: string,
): Promise<Buffer> {
  const model = commandName === 'gif' ? SUNBURST : FLARE
  return trackToolModelCall(
    { name: 'gif_generation', model: formatAiModelConfig(model) },
    async () => {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
      const response = await fetch(
        'https://api.openai.com/v1/images/generations',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(GIF_ATTEMPT_TIMEOUT_MS),
          body: JSON.stringify({
            model: model.model,
            prompt: buildImageGenerationPrompt(prompt),
            n: 1,
            quality: model.quality,
            output_format: 'gif',
          }),
        },
      )
      const body = (await response.json().catch(() => undefined)) as
        | { data?: { b64_json?: string }[]; error?: { message?: string } }
        | undefined
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? `Images API returned HTTP ${response.status}`,
        )
      }
      const gif = Buffer.from(body?.data?.[0]?.b64_json ?? '', 'base64')
      if (!gif.length) {
        throw new Error(`${formatAiModelConfig(model)} returned no GIF`)
      }
      return gif
    },
  )
}
