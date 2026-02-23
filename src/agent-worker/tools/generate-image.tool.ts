/**
 * Tool for generating/editing AI images
 */

import { getErrorMessage } from '@tg-bot/common'
import { generateImage } from '../services'
import { type AgentTool, Type } from '../types'
import { addResponse, requireToolContext } from './context'

export const generateImageTool: AgentTool = {
  timeoutMs: 60_000,
  declaration: {
    name: 'generate_or_edit_image',
    description:
      'Generate a NEW image using AI or EDIT an existing image. Use when user wants to create/draw something new, or edit/modify an attached image.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description:
            'Detailed description of the image to generate or edit instructions.',
        },
        useAttachedImage: {
          type: Type.BOOLEAN,
          description:
            'If true and user attached an image, use it as base for editing. Default: true.',
        },
        includeTextResponse: {
          type: Type.BOOLEAN,
          description:
            'If true, include AI commentary as caption. Default: false.',
        },
      },
      required: ['prompt'],
    },
  },
  execute: async (args) => {
    const { imagesData } = requireToolContext()

    try {
      const prompt = (args.prompt as string).trim()
      if (!prompt) {
        return 'Error generating image: Prompt cannot be empty'
      }

      const useAttachedImage = (args.useAttachedImage as boolean) ?? true
      const includeTextResponse = args.includeTextResponse as boolean
      const imagesToEdit =
        useAttachedImage && imagesData?.length ? imagesData : undefined
      const result = await generateImage(prompt, imagesToEdit)

      if (result.image) {
        addResponse({
          type: 'image',
          buffer: result.image,
          caption: includeTextResponse
            ? result.text?.slice(0, 1000)
            : undefined,
        })

        const action = imagesToEdit ? 'edited' : 'generated'
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
