/**
 * Fun game tools - Telegram dice animations
 */

import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

const DICE_TYPES = {
  dice: { emoji: '🎲', maxValue: 6, name: 'кубик' },
  darts: { emoji: '🎯', maxValue: 6, name: 'дартс' },
  basketball: { emoji: '🏀', maxValue: 5, name: 'баскетбол' },
  football: { emoji: '⚽', maxValue: 5, name: 'футбол' },
  bowling: { emoji: '🎳', maxValue: 6, name: 'боулинг' },
  slot: { emoji: '🎰', maxValue: 64, name: 'слоты' },
} as const

type DiceType = keyof typeof DICE_TYPES

export const telegramDiceTool: AgentTool = {
  execution: ['terminal'],
  declaration: {
    type: 'function',
    name: 'telegram_dice',
    description: `Send animated Telegram dice/game as a SEPARATE message (no text needed).
Available types: dice (🎲 1-6), darts (🎯 1-6), basketball (🏀 1-5), football (⚽ 1-5), bowling (🎳 1-6), slot (🎰 1-64).
For coin flip: use dice, 1-3 = heads, 4-6 = tails. Don't add commentary.`,
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: 'Type of dice animation to send',
          enum: ['dice', 'darts', 'basketball', 'football', 'bowling', 'slot'],
        },
      },
    },
  },
  execute: async (args) => {
    requireToolContext()

    const type = (args.type as DiceType) || 'dice'
    const diceInfo = DICE_TYPES[type] || DICE_TYPES.dice

    addResponse({
      type: 'dice',
      emoji: diceInfo.emoji,
    })

    return `Отправляю ${diceInfo.name} ${diceInfo.emoji} (результат от 1 до ${diceInfo.maxValue})`
  },
}
