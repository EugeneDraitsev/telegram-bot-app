/**
 * Tool for searching images on Google
 */

import { getErrorMessage } from '@tg-bot/common'
import { searchImage } from '../services'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

export const searchImageTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'search_image',
    description:
      'Search for an existing image on the internet using Google. Use when user wants to FIND, SHOW, or SEE an existing picture/photo. NOT for creating new images.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query for finding the image. Be specific. Use English for better results.',
        },
        caption: {
          type: 'string',
          description: 'Optional caption to send with the image',
        },
      },
      required: ['query'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    try {
      const query = (args.query as string).trim()
      if (!query) {
        return 'Error searching image: Query cannot be empty'
      }

      const result = await searchImage(query)

      addResponse({
        type: 'image',
        url: result.url,
        caption: (args.caption as string)?.trim() || undefined,
      })

      return `Found image for: "${query}"`
    } catch (error) {
      return `Error searching image: ${getErrorMessage(error)}`
    }
  },
}
