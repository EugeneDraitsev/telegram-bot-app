/**
 * Tool for searching images on Google
 * Pure tool - adds response to collector, doesn't send directly
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { getErrorMessage } from '@tg-bot/common'
import { searchImage } from '../services'
import { addResponse, requireToolContext } from './context'

export const searchImageTool = new DynamicStructuredTool({
  name: 'search_image',
  description:
    'Search for an existing image on the internet using Google. Use when user wants to FIND, SHOW, or SEE an existing picture/photo. NOT for creating new images.',
  schema: z.object({
    query: z
      .string()
      .describe(
        'Search query for finding the image. Be specific. Use English for better results.',
      ),
    caption: z
      .string()
      .optional()
      .describe('Optional caption to send with the image'),
  }),
  func: async ({ query, caption }) => {
    requireToolContext()

    try {
      const normalizedQuery = query.trim()
      if (!normalizedQuery) {
        return 'Error searching image: Query cannot be empty'
      }

      const result = await searchImage(normalizedQuery)

      addResponse({
        type: 'image',
        url: result.url,
        caption: caption?.trim() || undefined,
      })

      return `Found image for: "${normalizedQuery}"`
    } catch (error) {
      const errorMsg = getErrorMessage(error)
      return `Error searching image: ${errorMsg}`
    }
  },
})
