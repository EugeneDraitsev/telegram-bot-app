/**
 * Magic 8 Ball tool - random prediction with sticker
 */

import { getMagic8BallStickerId } from '@tg-bot/common'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

export const magic8BallTool: AgentTool = {
  execution: ['terminal'],
  declaration: {
    type: 'function',
    name: 'magic_8_ball',
    description:
      "Magic 8 Ball - send a random prediction sticker as a SEPARATE message. Use when user asks a yes/no question and wants a mystical answer, or uses 🎱 emoji. Don't add commentary.",
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'The question user is asking (optional)',
        },
      },
    },
  },
  execute: async (args) => {
    requireToolContext()

    addResponse({
      type: 'sticker',
      fileId: getMagic8BallStickerId(),
    })

    const question = args.question as string | undefined
    const questionText = question ? ` to "${question}"` : ''
    return `Magic 8 Ball has spoken${questionText}! Sent prediction sticker.`
  },
}
