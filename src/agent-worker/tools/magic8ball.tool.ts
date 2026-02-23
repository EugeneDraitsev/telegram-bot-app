/**
 * Magic 8 Ball tool - random prediction with sticker
 */

import { sample } from '@tg-bot/common'
import { type AgentTool, Type } from '../types'
import { addResponse, requireToolContext } from './context'

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

export const magic8BallTool: AgentTool = {
  declaration: {
    name: 'magic_8_ball',
    description:
      "Magic 8 Ball - send a random prediction sticker as a SEPARATE message. Use when user asks a yes/no question and wants a mystical answer, or uses 🎱 emoji. Don't add commentary.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        question: {
          type: Type.STRING,
          description: 'The question user is asking (optional)',
        },
      },
    },
  },
  execute: async (args) => {
    requireToolContext()

    const stickerId = sample(MAGIC_BALL_STICKERS)
    if (!stickerId) {
      return 'Error: Could not get prediction'
    }

    addResponse({
      type: 'sticker',
      fileId: stickerId,
    })

    const question = args.question as string | undefined
    const questionText = question ? ` to "${question}"` : ''
    return `Magic 8 Ball has spoken${questionText}! Sent prediction sticker.`
  },
}
