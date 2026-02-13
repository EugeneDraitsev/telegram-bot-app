/**
 * Magic 8 Ball tool - random prediction with sticker
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { sample } from '@tg-bot/common'
import { addResponse, requireToolContext } from './context'

// Magic Ball sticker pack: https://telegram.me/addstickers/magicBall
const MAGIC_BALL_STICKERS = [
  'BQADAgADYgADt7A3BoDZ58u5GNyPAg',
  'BQADAgADZAADt7A3BhljKKZjgGXtAg',
  'BQADAgADZgADt7A3Bs9cj69gGlocAg',
  'BQADAgADaAADt7A3BmStSmLLZBwxAg',
  'BQADAgADagADt7A3BoPYp7PlQl5fAg',
  'BQADAgADbAADt7A3BnptbzPfmMn1Ag',
  'BQADAgADbgADt7A3BklDNNYp4kfWAg',
  'BQADAgADcAADt7A3BmS_rlNb_urNAg',
  'BQADAgADcgADt7A3BsO6QhuVa5RXAg',
  'BQADAgADdAADt7A3BpLxoodPK1OWAg',
  'BQADAgADdgADt7A3BpmhhBqkfikyAg',
  'BQADAgADeAADt7A3Bp6Wr-D3duPSAg',
  'BQADAgADegADt7A3Br8RH16mv2HyAg',
  'BQADAgADfAADt7A3Bggy75myWyliAg',
  'BQADAgADfgADt7A3BgU1ufoc8cFWAg',
  'BQADAgADgAADt7A3BgcvSgO71AENAg',
  'BQADAgADggADt7A3BqjgUy3h4sdlAg',
  'BQADAgADhAADt7A3Bvj208m6u1NlAg',
  'BQADAgADhgADt7A3BoV9ejE-Lw4gAg',
  'BQADAgADiAADt7A3Bi3iPt8F9H3aAg',
]

export const magic8BallTool = new DynamicStructuredTool({
  name: 'magic_8_ball',
  description:
    'Magic 8 Ball - send a random prediction sticker as a SEPARATE message (no text needed). Use when user asks a yes/no question and wants a mystical answer, or asks for fortune telling, prediction, or uses "🎱" emoji. The sticker speaks for itself - don\'t add commentary.',
  schema: z.object({
    question: z
      .string()
      .optional()
      .describe('The question user is asking (optional, for context)'),
  }),
  func: async ({ question }) => {
    requireToolContext()

    const stickerId = sample(MAGIC_BALL_STICKERS)
    if (!stickerId) {
      return 'Error: Could not get prediction'
    }

    addResponse({
      type: 'sticker',
      fileId: stickerId,
    })

    const questionText = question ? ` to "${question}"` : ''
    return `Magic 8 Ball has spoken${questionText}! Sent prediction sticker.`
  },
})
