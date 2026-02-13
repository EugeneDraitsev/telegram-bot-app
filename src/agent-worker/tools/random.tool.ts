/**
 * Tool for generating random numbers and making random choices
 * Pure tool - returns random result
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { requireToolContext } from './context'

export const randomNumberTool = new DynamicStructuredTool({
  name: 'random_number',
  description:
    'Generate a random number within a specified range. Use for dice rolls, random selections, or any random number generation.',
  schema: z.object({
    min: z
      .number()
      .optional()
      .describe('Minimum value (inclusive). Defaults to 1.'),
    max: z
      .number()
      .optional()
      .describe('Maximum value (inclusive). Defaults to 100.'),
    count: z
      .number()
      .optional()
      .describe('Number of random values to generate. Defaults to 1.'),
  }),
  func: async ({ min, max, count }) => {
    requireToolContext()

    const minVal = min ?? 1
    const maxVal = max ?? 100
    const countVal = Math.min(count ?? 1, 20) // Limit to 20 numbers

    if (minVal > maxVal) {
      return `Error: min (${minVal}) cannot be greater than max (${maxVal})`
    }

    const results: number[] = []
    for (let i = 0; i < countVal; i++) {
      const randomNum =
        Math.floor(Math.random() * (maxVal - minVal + 1)) + minVal
      results.push(randomNum)
    }

    if (countVal === 1) {
      return `Random number (${minVal}-${maxVal}): ${results[0]}`
    }
    return `Random numbers (${minVal}-${maxVal}): ${results.join(', ')}`
  },
})

export const randomChoiceTool = new DynamicStructuredTool({
  name: 'random_choice',
  description:
    'Make a random choice from a list of options. Use for decisions, picking winners, or choosing between alternatives.',
  schema: z.object({
    options: z
      .array(z.string())
      .describe(
        'List of options to choose from (e.g., ["pizza", "sushi", "burger"])',
      ),
    count: z
      .number()
      .optional()
      .describe(
        'Number of items to pick (without replacement). Defaults to 1.',
      ),
  }),
  func: async ({ options, count }) => {
    requireToolContext()

    if (!options || options.length === 0) {
      return 'Error: Please provide at least one option to choose from'
    }

    const countVal = Math.min(count ?? 1, options.length)

    if (countVal === 1) {
      const randomIndex = Math.floor(Math.random() * options.length)
      return `Random choice: ${options[randomIndex]}`
    }

    // Shuffle and pick first N (Fisher-Yates)
    const shuffled = [...options]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const picked = shuffled.slice(0, countVal)
    return `Random choices (${countVal}): ${picked.join(', ')}`
  },
})
