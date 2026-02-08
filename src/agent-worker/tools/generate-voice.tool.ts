/**
 * Tool for generating voice messages (TTS)
 * Pure tool - adds response to collector, doesn't send directly
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { getErrorMessage } from '@tg-bot/common'
import { generateVoice } from '../services'
import { addResponse, requireToolContext } from './context'

export const generateVoiceTool = new DynamicStructuredTool({
  name: 'generate_voice',
  description:
    'Generate a voice message (text-to-speech). Use when user asks for audio response, wants to hear something, or you want to add a voice message.',
  schema: z.object({
    text: z
      .string()
      .describe(
        'The text to convert to speech. Keep it concise (max ~500 words).',
      ),
    voice: z
      .enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'])
      .optional()
      .describe(
        'Voice to use. nova=female, onyx=male, alloy=neutral. Default: nova',
      ),
  }),
  func: async ({ text, voice = 'nova' }) => {
    requireToolContext()

    try {
      const normalizedText = text.trim()
      if (!normalizedText) {
        return 'Error generating voice: Text cannot be empty'
      }

      const buffer = await generateVoice(normalizedText, voice)

      addResponse({
        type: 'voice',
        buffer,
      })

      return `Generated voice message (${voice}): "${normalizedText.slice(0, 50)}..."`
    } catch (error) {
      const errorMsg = getErrorMessage(error)
      return `Error generating voice: ${errorMsg}`
    }
  },
})
