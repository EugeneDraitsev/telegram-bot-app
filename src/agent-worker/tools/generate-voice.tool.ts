/**
 * Tool for generating voice messages (TTS)
 */

import { getErrorMessage } from '@tg-bot/common'
import { generateVoice } from '../services'
import { type AgentTool, Type } from '../types'
import { addResponse, requireToolContext } from './context'

export const generateVoiceTool: AgentTool = {
  declaration: {
    name: 'generate_voice',
    description:
      'Generate a voice message (text-to-speech). Use when user asks for audio response.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        text: {
          type: Type.STRING,
          description:
            'The text to convert to speech. Keep concise (~500 words).',
        },
        voice: {
          type: Type.STRING,
          description:
            'Voice: nova=female, onyx=male, alloy=neutral. Default: nova.',
          enum: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        },
      },
      required: ['text'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    try {
      const text = (args.text as string).trim()
      if (!text) {
        return 'Error generating voice: Text cannot be empty'
      }

      const voice =
        (args.voice as
          | 'alloy'
          | 'echo'
          | 'fable'
          | 'onyx'
          | 'nova'
          | 'shimmer') || 'nova'
      const buffer = await generateVoice(text, voice)

      addResponse({ type: 'voice', buffer })
      return `Generated voice message (${voice}): "${text.slice(0, 50)}..."`
    } catch (error) {
      return `Error generating voice: ${getErrorMessage(error)}`
    }
  },
}
