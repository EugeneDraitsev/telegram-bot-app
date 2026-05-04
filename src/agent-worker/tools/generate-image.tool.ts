/**
 * Tool for generating/editing AI images.
 */

import {
  buildImageEditTargetPrompt,
  getErrorMessage,
  type MediaBuffer,
} from '@tg-bot/common'
import { generateImageOpenAi } from '../services'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

function isHistoryImage(media: MediaBuffer): boolean {
  return (media.label ?? '').toLowerCase().includes('recent chat history')
}

function getImageEditCandidates(
  mediaBuffers: MediaBuffer[] | undefined,
): MediaBuffer[] {
  const images = (mediaBuffers ?? []).filter(
    (media) => media.mediaType === 'image',
  )
  const requestImages = images.filter((media) => !isHistoryImage(media))

  if (requestImages.length) {
    return requestImages
  }

  return images.slice(-1)
}

export const generateImageTool: AgentTool = {
  timeoutMs: 120_000,
  declaration: {
    type: 'function',
    name: 'generate_or_edit_image',
    description:
      'Generate a NEW image using AI or EDIT an existing image immediately. Use when user wants to create/draw something new, or edit/modify an attached image. Infer missing aesthetic details and choose sensible defaults instead of asking follow-up style questions.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed description of the image to generate or edit instructions, including any inferred defaults needed to act now.',
        },
        useAttachedImage: {
          type: 'boolean',
          description:
            'If true and user attached an image, use it as base for editing. Default: true.',
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
    const { mediaBuffers } = requireToolContext()

    try {
      const prompt = (args.prompt as string).trim()
      if (!prompt) {
        return 'Error generating image: Prompt cannot be empty'
      }

      const useAttachedImage = (args.useAttachedImage as boolean) ?? true
      const includeTextResponse = args.includeTextResponse as boolean
      const imageCandidates = getImageEditCandidates(mediaBuffers)
      const imagesToEdit =
        useAttachedImage && imageCandidates.length ? imageCandidates : undefined
      const result = await generateImageOpenAi(
        buildImageEditTargetPrompt(
          prompt,
          imagesToEdit?.map(
            (media) => media.label || 'Unlabeled image context',
          ) ?? [],
        ),
        imagesToEdit?.map((media) => media.buffer),
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
