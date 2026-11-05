/**
 * Tool for generating animated GIFs with AI.
 */

import { getErrorMessage } from '@tg-bot/common'
import {
  GIF_TOOL_TIMEOUT_MS,
  generateAgentGif,
  getGifTiming,
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
        frameCount: {
          type: 'integer',
          minimum: 2,
          maximum: 64,
          description:
            'Number of frames, default 24. Loop length = frameCount × frameDurationMs. More frames take longer and cost more.',
        },
        frameDurationMs: {
          type: 'integer',
          minimum: 20,
          maximum: 2000,
          description:
            'Milliseconds per frame in steps of 10, default 80 (12.5 fps). fps = 1000 / frameDurationMs, so 24 fps is 40 and 10 fps is 100.',
        },
      },
      required: ['prompt'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    try {
      const prompt = (args.prompt as string).trim()
      if (!prompt) {
        throw new Error('Prompt cannot be empty')
      }

      claimGeneratedMedia()
      const { gif, timing } = await generateAgentGif(
        prompt,
        getGifTiming(args.frameCount, args.frameDurationMs),
      )

      addResponse({ type: 'animation', buffer: gif })
      const fps = Math.round(10_000 / timing.frameDurationMs) / 10
      return `Successfully generated GIF (${timing.frameCount} frames at ${fps} fps) for: "${prompt.slice(0, 50)}..."`
    } catch (error) {
      throw new Error(`Error generating GIF: ${getErrorMessage(error)}`)
    }
  },
}
