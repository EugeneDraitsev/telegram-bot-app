/**
 * Code execution tool — wraps flash-lite with built-in code_execution.
 * Replaces the old calculator tool — can run real Python, not just basic math.
 */

import { getErrorMessage } from '@tg-bot/common'
import { ai, FAST_MODEL } from '../agent/models'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

export const codeExecutionTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'code_execution',
    description:
      'Execute code to perform calculations, data processing, or any computational task. Use for math, conversions, date calculations, sorting, formatting, etc. Powered by Python — can handle anything a calculator can and much more.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description:
            'Description of what to calculate or process (e.g. "15% of 240", "fibonacci(50)", "convert 100 USD to EUR at rate 0.92")',
        },
      },
      required: ['task'],
    },
  },
  execute: async (args) => {
    requireToolContext()
    const task = (args.task as string)?.trim()
    if (!task) {
      return 'Error: task cannot be empty'
    }

    try {
      const interaction = await ai.interactions.create({
        model: FAST_MODEL,
        input: task,
        tools: [{ type: 'code_execution' }],
      })

      const textOutput = interaction.outputs?.find((o) => o.type === 'text')
      if (textOutput && 'text' in textOutput && textOutput.text) {
        return textOutput.text
      }

      return 'Code execution produced no output'
    } catch (error) {
      return `Code execution failed: ${getErrorMessage(error)}`
    }
  },
}
