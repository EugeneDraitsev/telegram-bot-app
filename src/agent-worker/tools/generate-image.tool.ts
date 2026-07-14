/**
 * Tool for generating/editing AI images.
 */

import {
  buildImageEditTargetPrompt,
  getErrorMessage,
  logger,
  type MediaBuffer,
} from '@tg-bot/common'
import { generateImage, generateImageOpenAi } from '../services'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

type ImageMediaSource = 'none' | 'request' | 'history'

const OPENAI_IMAGE_COMMANDS = new Set(['e', 'ee', 'gp', 'de'])

async function generateWithFallback(
  prompt: string,
  inputImages: Buffer[] | undefined,
  useOpenAiPrimary: boolean,
  commandName?: string,
) {
  if (useOpenAiPrimary) {
    return generateImageOpenAi(prompt, inputImages)
  }

  if (commandName === 'ge') {
    return generateImage(prompt, inputImages)
  }

  try {
    const result = await generateImage(prompt, inputImages)
    if (result.image) {
      return result
    }

    logger.warn(
      { commandName, reason: 'no_image' },
      'image_gen.openai_fallback',
    )
  } catch (error) {
    logger.warn(
      { commandName, error: getErrorMessage(error) },
      'image_gen.openai_fallback',
    )
  }

  return generateImageOpenAi(prompt, inputImages)
}

function isHistoryImage(media: MediaBuffer): boolean {
  return (media.label ?? '').toLowerCase().includes('recent chat history')
}

function getMediaSource(args: Record<string, unknown>): ImageMediaSource {
  if (
    args.mediaSource === 'none' ||
    args.mediaSource === 'request' ||
    args.mediaSource === 'history'
  ) {
    return args.mediaSource
  }

  return ((args.useAttachedImage as boolean | undefined) ?? true)
    ? 'request'
    : 'none'
}

function getImageEditCandidates(
  mediaBuffers: MediaBuffer[] | undefined,
  mediaSource: ImageMediaSource,
): MediaBuffer[] {
  if (mediaSource === 'none') {
    return []
  }

  const images = (mediaBuffers ?? []).filter(
    (media) => media.mediaType === 'image',
  )
  if (mediaSource === 'history') {
    return images.filter(isHistoryImage).slice(-1)
  }

  return images.filter((media) => !isHistoryImage(media))
}

export const generateImageTool: AgentTool = {
  timeoutMs: 120_000,
  declaration: {
    type: 'function',
    name: 'generate_or_edit_image',
    description:
      'Generate a NEW image using AI or EDIT an existing image immediately. Use when user wants to create/draw something new, or edit/modify an attached image. Infer missing aesthetic details and choose sensible defaults instead of asking follow-up style questions. Build the image prompt only from the current user message, reply target/quote, and tool results intentionally gathered for this request. Do not blend in unrelated recent chat history, emoji, stickers, or history images.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed description of the image to generate or edit instructions. Include only visual details directly requested now or present in the current reply target/quote. Do not include unrelated recent-history text, emoji, stickers, or images.',
        },
        mediaSource: {
          type: 'string',
          enum: ['none', 'request', 'history'],
          description:
            'Which image media to use as edit/reference input. "request" uses only explicit current/reply/album media and is the default. "history" uses the newest recent-history image only when the user explicitly asks for the last/recent chat image. "none" generates from text only.',
        },
        useAttachedImage: {
          type: 'boolean',
          description:
            'Deprecated compatibility flag. If true, behaves like mediaSource="request"; it never falls back to history images.',
        },
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
        return 'Error generating image: Prompt cannot be empty'
      }

      const mediaSource = getMediaSource(args)
      const includeTextResponse = args.includeTextResponse as boolean
      const imageCandidates = getImageEditCandidates(mediaBuffers, mediaSource)
      const imagesToEdit =
        imageCandidates.length > 0 ? imageCandidates : undefined
      const imagePrompt = buildImageEditTargetPrompt(
        prompt,
        imagesToEdit?.map(
          (media) => media.label || 'Unlabeled image context',
        ) ?? [],
      )
      const result = await generateWithFallback(
        imagePrompt,
        imagesToEdit?.map((media) => media.buffer),
        Boolean(commandName && OPENAI_IMAGE_COMMANDS.has(commandName)),
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
        return 'Could not generate image, added text response instead'
      }

      return 'Error: No image or text generated'
    } catch (error) {
      return `Error generating image: ${getErrorMessage(error)}`
    }
  },
}
