/**
 * Tool for generating voice messages (TTS)
 */

import { getErrorMessage } from '@tg-bot/common'
import {
  DEFAULT_VOICE,
  generateVoice,
  VOICE_TOOL_TIMEOUT_MS,
  VOICES,
} from '../services/google-tts'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

export const generateVoiceTool: AgentTool = {
  execution: ['after-data', 'terminal'],
  timeoutMs: VOICE_TOOL_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_voice',
    description:
      "Read the supplied text as a voice message with Gemini TTS. Use style for acting and voice_description to design a fictional character's timbre. Use when the user asks for spoken audio.",
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'The exact text to read aloud, up to 4096 characters.',
          maxLength: 4096,
        },
        voice: {
          type: 'string',
          description: `Built-in voice (${VOICES.join(', ')}) or a reusable Google voice_... ID. Default: ${DEFAULT_VOICE}. Ignored when voice_description is supplied.`,
        },
        style: {
          type: 'string',
          description:
            'Delivery: emotion, pacing, whispering, shouting or dramatic pauses. Keep the spoken text unchanged.',
          maxLength: 500,
        },
        voice_description: {
          type: 'string',
          description:
            'Optional fictional voice design: age, gender, timbre, texture and accent in 1–2 sentences. Creates a one-off voice before synthesis. Use only when the user asks for a custom character voice; otherwise pick a built-in voice.',
          maxLength: 1000,
        },
      },
      required: ['text'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    try {
      const text = typeof args.text === 'string' ? args.text.trim() : ''
      if (!text) {
        throw new Error('Text cannot be empty')
      }

      const buffer = await generateVoice(text, {
        voice: typeof args.voice === 'string' ? args.voice : undefined,
        style: typeof args.style === 'string' ? args.style : undefined,
        voiceDescription:
          typeof args.voice_description === 'string'
            ? args.voice_description
            : undefined,
      })

      addResponse({ type: 'voice', buffer })
      return `Generated voice message: "${text.slice(0, 50)}..."`
    } catch (error) {
      throw new Error(`Error generating voice: ${getErrorMessage(error)}`)
    }
  },
}
