import { generateImage } from 'ai'

import {
  buildImageGenerationPrompt,
  clamp,
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

export interface GifTiming {
  frameCount: number
  frameDurationMs: number
}

function fitToStep(
  value: unknown,
  [min, max, step]: [number, number, number],
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(Math.round(value / step) * step, min, max)
}

/**
 * Fits requested timing into the Images API GIF limits. The API's own default
 * of 9 frames at 200 ms plays at 5 fps and looks choppy, so an unset value
 * falls back to 16 frames at 80 ms: a 12.5 fps loop of 1.28 seconds.
 */
export function getGifTiming(
  frameCount?: unknown,
  frameDurationMs?: unknown,
): GifTiming {
  return {
    frameCount: fitToStep(frameCount, [2, 16, 1], 16),
    // The API rounds each frame to 10 ms.
    frameDurationMs: fitToStep(frameDurationMs, [20, 2000, 10], 80),
  }
}

// The guide caps a GIF request by a total pixel budget without naming it, and
// the API rejected 24 frames left at `size: auto`. Assume the documented 4K
// image maximum and size each square frame to keep every frame inside it.
const GIF_PIXEL_BUDGET = 3840 * 2160
const MAX_GIF_FRAME_EDGE = 1024
// The API's own timing, used when it rejects ours.
const API_DEFAULT_GIF_TIMING: GifTiming = {
  frameCount: 9,
  frameDurationMs: 200,
}

/** The largest square frame, in multiples of 16, that keeps all frames in budget. */
export function getGifFrameSize(frameCount: number): string {
  const edge = Math.min(
    MAX_GIF_FRAME_EDGE,
    Math.floor(Math.sqrt(GIF_PIXEL_BUDGET / frameCount) / 16) * 16,
  )
  return `${edge}x${edge}`
}

type ImagesApiBody =
  | {
      data?: { b64_json?: string }[]
      error?: { message?: string; param?: string; code?: string }
    }
  | undefined

/**
 * Animated GIFs come only from the Images API generations endpoint. The AI SDK
 * rejects the `gif` output format, so this request goes to the API directly.
 * Every GIF, /gif or not, uses Sunburst for detail that holds across frames.
 * GIF frame limits are only partly documented, so a rejected request is tried
 * once more with the API's own timing, which is known to work.
 */
export function generateAgentGif(
  prompt: string,
  timing: GifTiming,
): Promise<{ gif: Buffer; timing: GifTiming }> {
  const model = SUNBURST
  const label = formatAiModelConfig(model)
  return trackToolModelCall(
    { name: 'gif_generation', model: label },
    async () => {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
      const signal = AbortSignal.timeout(GIF_ATTEMPT_TIMEOUT_MS)
      const request = async (frames?: GifTiming) => {
        const response = await fetch(
          'https://api.openai.com/v1/images/generations',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            signal,
            body: JSON.stringify({
              model: model.model,
              prompt: buildImageGenerationPrompt(prompt),
              n: 1,
              quality: model.quality,
              output_format: 'gif',
              ...(frames && {
                frame_count: frames.frameCount,
                frame_duration_ms: frames.frameDurationMs,
                size: getGifFrameSize(frames.frameCount),
              }),
            }),
          },
        )
        const body = (await response
          .json()
          .catch(() => undefined)) as ImagesApiBody
        return { response, body }
      }

      let usedTiming = timing
      let { response, body } = await request(timing)
      if (response.status === 400) {
        logger.warn(
          { model: label, ...timing, error: body?.error },
          'gif_gen.timing_fallback',
        )
        usedTiming = API_DEFAULT_GIF_TIMING
        ;({ response, body } = await request())
      }
      if (!response.ok) {
        throw new Error(
          body?.error?.message ?? `Images API returned HTTP ${response.status}`,
        )
      }
      const gif = Buffer.from(body?.data?.[0]?.b64_json ?? '', 'base64')
      if (!gif.length) throw new Error(`${label} returned no GIF`)
      return { gif, timing: usedTiming }
    },
  )
}
