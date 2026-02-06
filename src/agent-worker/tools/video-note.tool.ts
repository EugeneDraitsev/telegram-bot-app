/**
 * Tool for Telegram video notes.
 *
 * Current fallback:
 * - generates voice message until real circular video-note rendering is ready.
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { generateVoice } from '../services'
import { addResponse, requireToolContext } from './context'

export const videoNoteTool = new DynamicStructuredTool({
  name: 'generate_video_note',
  description:
    'Generate Telegram video_note (делает кружочек). Use when user asks for video note/circle/kruzhochek. Currently falls back to voice.',
  schema: z.object({
    text: z.string().describe('The text for the video note content'),
    voice: z
      .enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
      .optional()
      .describe('Voice to use. Default: nova'),
  }),
  func: async ({ text, voice = 'nova' }) => {
    requireToolContext()

    try {
      const normalizedText = text.trim()
      if (!normalizedText) {
        return 'Error generating video note: Text cannot be empty'
      }

      // TODO: implement real circular video_note generation.
      const buffer = await generateVoice(normalizedText, voice)
      addResponse({
        type: 'voice',
        buffer,
      })

      return `Generated voice fallback for video note: "${normalizedText.slice(0, 50)}..."`
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      return `Error generating video note: ${errorMsg}`
    }
  },
})
