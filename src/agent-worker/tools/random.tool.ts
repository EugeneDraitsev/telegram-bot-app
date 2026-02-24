/**
 * Tools for random numbers and choices
 */

import type { AgentTool } from '../types'
import { requireToolContext } from './context'

export const randomNumberTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'random_number',
    description:
      'Generate a random number within a specified range. Use for dice rolls, random selections.',
    parameters: {
      type: 'object',
      properties: {
        min: {
          type: 'number',
          description: 'Minimum value (inclusive). Defaults to 1.',
        },
        max: {
          type: 'number',
          description: 'Maximum value (inclusive). Defaults to 100.',
        },
        count: {
          type: 'number',
          description: 'Number of random values to generate. Defaults to 1.',
        },
      },
    },
  },
  execute: async (args) => {
    requireToolContext()

    const minVal = (args.min as number) ?? 1
    const maxVal = (args.max as number) ?? 100
    const countVal = Math.min((args.count as number) ?? 1, 20)

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
}

export const randomChoiceTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'random_choice',
    description:
      'Make a random choice from a list of options. Use for decisions, picking winners.',
    parameters: {
      type: 'object',
      properties: {
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of options to choose from',
        },
        count: {
          type: 'number',
          description: 'Number of items to pick. Defaults to 1.',
        },
      },
      required: ['options'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    const options = args.options as string[]
    if (!options || options.length === 0) {
      return 'Error: Please provide at least one option to choose from'
    }

    const countVal = Math.min((args.count as number) ?? 1, options.length)

    if (countVal === 1) {
      const randomIndex = Math.floor(Math.random() * options.length)
      return `Random choice: ${options[randomIndex]}`
    }

    const shuffled = [...options]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }

    const picked = shuffled.slice(0, countVal)
    return `Random choices (${countVal}): ${picked.join(', ')}`
  },
}
