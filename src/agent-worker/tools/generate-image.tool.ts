/**
 * Tool for generating/editing AI images
 * Pure tool - adds response to collector, doesn't send directly
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { generateImage } from '../services'
import { addResponse, requireToolContext } from './context'

export const generateImageTool = new DynamicStructuredTool({
  name: 'generate_or_edit_image',
  description:
    'Generate a NEW image using AI or EDIT an existing image. Use when user wants to create/draw something new, or edit/modify an attached image.',
  schema: z.object({
    prompt: z
      .string()
      .describe(
        'Detailed description of the image to generate or edit instructions. Be specific about style, colors, composition.',
      ),
    useAttachedImage: z
      .boolean()
      .optional()
      .describe(
        'If true and user attached an image, use it as base for editing. Default: true if image is attached.',
      ),
    includeTextResponse: z
      .boolean()
      .optional()
      .describe('If true, include AI commentary as caption. Default: false'),
  }),
  func: async ({ prompt, useAttachedImage = true, includeTextResponse }) => {
    const { imagesData } = requireToolContext()

    try {
      const normalizedPrompt = prompt.trim()
      if (!normalizedPrompt) {
        return 'Error generating image: Prompt cannot be empty'
      }

      const imagesToEdit =
        useAttachedImage && imagesData?.length ? imagesData : undefined
      const result = await generateImage(normalizedPrompt, imagesToEdit)

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
        return `Could not generate image, added text response instead`
      }

      return 'Error: No image or text generated'
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `Error generating image: ${errorMsg}`
    }
  },
})
