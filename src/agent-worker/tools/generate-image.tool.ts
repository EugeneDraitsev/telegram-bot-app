/**
 * Tool for generating/editing AI images.
 */

import { buildImageEditTargetPrompt, getErrorMessage } from '@tg-bot/common'
import {
  generateAgentImage,
  IMAGE_TOOL_TIMEOUT_MS,
} from '../services/image-generation'
import type { AgentTool } from '../types'
import { addResponse, claimGeneratedMedia, requireToolContext } from './context'
import { getMediaIdsParameter, selectMediaForTool } from './media-selection'

export const generateImageTool: AgentTool = {
  execution: ['after-data'],
  timeoutMs: IMAGE_TOOL_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_or_edit_image',
    description:
      'Generate a NEW image using AI or EDIT selected images immediately. Use when the user wants to create, draw, edit, or modify an image. The structured MEDIA_CONTEXT ties every media_id to its source message and visible content; select only the media the user actually refers to. Only one generated media result can be created per request.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed description of the image to generate or edit instructions. Include only visual details directly requested now or present in the current reply target/quote. Do not include unrelated recent-history text, emoji, stickers, or images.',
        },
        mediaIds: getMediaIdsParameter('image edit/reference inputs'),
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
      claimGeneratedMedia()
      const image = await generateAgentImage(
        imagePrompt,
        imagesToEdit?.map((media) => media.buffer),
        commandName,
      )

      addResponse({ type: 'image', buffer: image })
      const action = imagesToEdit?.length ? 'edited' : 'generated'
      return `Successfully ${action} image for: "${prompt.slice(0, 50)}..."`
    } catch (error) {
      throw new Error(`Error generating image: ${getErrorMessage(error)}`)
    }
  },
}
