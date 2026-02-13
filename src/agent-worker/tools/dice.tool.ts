/**
 * Fun game tools - Telegram dice animations
 * Uses Telegram's built-in sendDice API for animated results
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { addResponse, requireToolContext } from './context'

// Telegram dice emoji types and their value ranges
const DICE_TYPES = {
  dice: { emoji: '🎲', maxValue: 6, name: 'кубик' },
  darts: { emoji: '🎯', maxValue: 6, name: 'дартс' },
  basketball: { emoji: '🏀', maxValue: 5, name: 'баскетбол' },
  football: { emoji: '⚽', maxValue: 5, name: 'футбол' },
  bowling: { emoji: '🎳', maxValue: 6, name: 'боулинг' },
  slot: { emoji: '🎰', maxValue: 64, name: 'слоты' },
} as const

type DiceType = keyof typeof DICE_TYPES

export const telegramDiceTool = new DynamicStructuredTool({
  name: 'telegram_dice',
  description: `Send animated Telegram dice/game as a SEPARATE message (no text needed).
Available types:
- dice (🎲) - roll a die (1-6). For coin flip: 1-3 = heads, 4-6 = tails
- darts (🎯) - throw darts (1-6, 6 = bullseye)
- basketball (🏀) - shoot basketball (1-5, 4-5 = score)
- football (⚽) - kick football (1-5, 4-5 = goal)
- bowling (🎳) - bowling (1-6, 6 = strike)
- slot (🎰) - slot machine (1-64, 64 = jackpot 777)
The emoji is sent as a standalone animated message. Don't add commentary.`,
  schema: z.object({
    type: z
      .enum(['dice', 'darts', 'basketball', 'football', 'bowling', 'slot'])
      .default('dice')
      .describe('Type of dice animation to send'),
  }),
  func: async ({ type = 'dice' }) => {
    requireToolContext()

    const diceInfo = DICE_TYPES[type as DiceType]

    addResponse({
      type: 'dice',
      emoji: diceInfo.emoji,
    })

    return `Отправляю ${diceInfo.name} ${diceInfo.emoji} (результат от 1 до ${diceInfo.maxValue})`
  },
})
