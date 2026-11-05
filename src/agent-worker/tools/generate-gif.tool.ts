/**
 * Tool for generating animated GIFs with AI.
 */

import { getErrorMessage } from '@tg-bot/common'
import {
  GIF_TOOL_TIMEOUT_MS,
  generateAgentGif,
} from '../services/image-generation'
import type { AgentTool } from '../types'
import { addResponse, claimGeneratedMedia, requireToolContext } from './context'

export const generateGifTool: AgentTool = {
  execution: ['after-data'],
  timeoutMs: GIF_TOOL_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_gif',
    description:
      'Generate a NEW short looping animated GIF from a text description using AI. Use when the user asks to create, draw, or make a GIF or a short silent animation. Text-only: it cannot animate an existing photo or video (use generate_video_with_omni for that). Use search_gif to find an existing reaction GIF and animate_text for animated text only. Only one generated media result can be created per request.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'The subject, its motion, and how the loop returns to its starting pose. Include only visual details directly requested now or present in the current reply target/quote.',
        },
      },
      required: ['prompt'],
    },
  },
  execute: async (args) => {
    const { commandName } = requireToolContext()

    try {
      const prompt = (args.prompt as string).trim()
      if (!prompt) {
        throw new Error('Prompt cannot be empty')
      }

      claimGeneratedMedia()
      const gif = await generateAgentGif(prompt, commandName)

      addResponse({ type: 'animation', buffer: gif })
      return `Successfully generated GIF for: "${prompt.slice(0, 50)}..."`
    } catch (error) {
      throw new Error(`Error generating GIF: ${getErrorMessage(error)}`)
    }
  },
}
