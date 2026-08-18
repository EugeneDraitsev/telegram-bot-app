/**
 * Tool for generating/editing AI images.
 */

import {
  buildImageEditTargetPrompt,
  formatAiModelConfig,
  GEMINI_FLASH_LITE_IMAGE_MODEL,
  getErrorMessage,
  logger,
} from '@tg-bot/common'
import { generateImage, generateImageOpenAi } from '../services'
import { IMAGE_MODEL } from '../services/openai-image'
import type { AgentTool } from '../types'
import {
  addResponse,
  claimPaidMediaGeneration,
  requireToolContext,
  trackToolModelCall,
} from './context'
import { getMediaIdsParameter, selectMediaForTool } from './media-selection'

const OPENAI_IMAGE_COMMANDS = new Set(['e', 'ee', 'gp', 'de'])
const IMAGE_TOOL_TIMEOUT_MS = 120_000
const IMAGE_METRIC_NAME = 'image_generation'
const GEMINI_IMAGE_MODEL = formatAiModelConfig(GEMINI_FLASH_LITE_IMAGE_MODEL)
const OPENAI_IMAGE_MODEL = `openai/${IMAGE_MODEL}`

type ImageGenerationResult = { image?: Buffer; text?: string }
type ImageProvider = 'gemini' | 'openai'
type ImageGenerationRoute = { provider: ImageProvider; model: string }

const GEMINI_IMAGE_ROUTE: ImageGenerationRoute = {
  provider: 'gemini',
  model: GEMINI_IMAGE_MODEL,
}
const OPENAI_IMAGE_ROUTE: ImageGenerationRoute = {
  provider: 'openai',
  model: OPENAI_IMAGE_MODEL,
}

export function getImageGenerationRoute(
  commandName?: string,
): ImageGenerationRoute[] {
  if (commandName && OPENAI_IMAGE_COMMANDS.has(commandName)) {
    return [OPENAI_IMAGE_ROUTE]
  }
  if (commandName === 'ge') {
    return [GEMINI_IMAGE_ROUTE]
  }
  return [GEMINI_IMAGE_ROUTE, OPENAI_IMAGE_ROUTE]
}

function classifyImageResult(result: ImageGenerationResult) {
  return result.image ? ('success' as const) : ('error' as const)
}

function generateTracked(
  route: ImageGenerationRoute,
  prompt: string,
  inputImages: Buffer[] | undefined,
  fallbackFrom?: string,
) {
  const generate =
    route.provider === 'gemini' ? generateImage : generateImageOpenAi
  return trackToolModelCall(
    {
      name: IMAGE_METRIC_NAME,
      model: route.model,
      fallbackFrom,
      classifyResult: classifyImageResult,
    },
    () => generate(prompt, inputImages),
  )
}

async function generateWithFallback(
  prompt: string,
  inputImages: Buffer[] | undefined,
  commandName?: string,
) {
  const [primary, fallback] = getImageGenerationRoute(commandName)
  if (!primary) throw new Error('Image generation route is empty')
  if (!fallback) return generateTracked(primary, prompt, inputImages)

  try {
    const result = await generateTracked(primary, prompt, inputImages)
    if (result.image) {
      return result
    }

    logger.warn(
      { commandName, model: primary.model, reason: 'no_image' },
      'image_gen.openai_fallback',
    )
  } catch (error) {
    logger.warn(
      {
        commandName,
        model: primary.model,
        error: getErrorMessage(error),
      },
      'image_gen.openai_fallback',
    )
  }

  return generateTracked(fallback, prompt, inputImages, primary.model)
}

export const generateImageTool: AgentTool = {
  execution: ['after-data'],
  timeoutMs: IMAGE_TOOL_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_or_edit_image',
    description:
      'Generate a NEW image using AI or EDIT selected images immediately. Use when the user wants to create, draw, edit, or modify an image. The structured MEDIA_CONTEXT ties every media_id to its source message and visible content; select only the media the user actually refers to.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed description of the image to generate or edit instructions. Include only visual details directly requested now or present in the current reply target/quote. Do not include unrelated recent-history text, emoji, stickers, or images.',
        },
        mediaIds: getMediaIdsParameter('image edit/reference inputs'),
        includeTextResponse: {
          type: 'boolean',
          description:
            'If true, include AI commentary as caption. Default: false.',
        },
      },
      required: ['prompt'],
    },
  },
  execute: async (args) => {
    const { commandName, mediaBuffers } = requireToolContext()

    try {
      const prompt = (args.prompt as string).trim()
      if (!prompt) {
        throw new Error('Prompt cannot be empty')
      }

      const includeTextResponse = args.includeTextResponse as boolean
      const { media: imageCandidates } = selectMediaForTool(
        mediaBuffers,
        args.mediaIds,
        ['image'],
      )
      const imagesToEdit =
        imageCandidates.length > 0 ? imageCandidates : undefined
      const imagePrompt = buildImageEditTargetPrompt(
        prompt,
        imagesToEdit?.map(
          (media) => media.label || 'Unlabeled image context',
        ) ?? [],
      )
      claimPaidMediaGeneration()
      const result = await generateWithFallback(
        imagePrompt,
        imagesToEdit?.map((media) => media.buffer),
        commandName,
      )

      if (result.image) {
        addResponse({
          type: 'image',
          buffer: result.image,
          caption: includeTextResponse
            ? result.text?.slice(0, 1000)
            : undefined,
        })

        const action = imagesToEdit?.length ? 'edited' : 'generated'
        return `Successfully ${action} image for: "${prompt.slice(0, 50)}..."`
      }

      if (result.text) {
        addResponse({ type: 'text', text: result.text })
        throw new Error('Could not generate image; added text response instead')
      }

      throw new Error('No image or text generated')
    } catch (error) {
      throw new Error(`Error generating image: ${getErrorMessage(error)}`)
    }
  },
}
