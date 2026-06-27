/**
 * Code execution tool — wraps flash-lite with built-in code_execution.
 * Replaces the old calculator tool — can run real Python, not just basic math.
 */

import { generateText } from 'ai'

import {
  getAiSdkGoogleTools,
  getAiSdkLanguageModel,
  getErrorMessage,
} from '@tg-bot/common'
import { TOOL_CALL_TIMEOUT_MS } from '../agent/config'
import { HELPER_TEXT_MODEL_CONFIG } from '../agent/models'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

export const codeExecutionTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'code_execution',
    description:
      'Execute code to perform calculations, data processing, or computational tasks. Use for math, conversions, date calculations, sorting, formatting, etc. Do not use this merely to prepare SVG path data or LaTeX for visual answers; call render_svg_to_png or render_latex directly for those.',
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
      if (HELPER_TEXT_MODEL_CONFIG.provider !== 'google') {
        return 'Code execution failed: configured helper model provider does not support Google code_execution'
      }

      const result = await generateText({
        model: getAiSdkLanguageModel(HELPER_TEXT_MODEL_CONFIG),
        prompt: task,
        tools: {
          code_execution: getAiSdkGoogleTools().codeExecution({}),
        },
        toolChoice: 'auto',
        maxRetries: 0,
        timeout: TOOL_CALL_TIMEOUT_MS,
        providerOptions: { google: { serviceTier: 'priority' } },
      })

      if (result.text.trim()) {
        return result.text.trim()
      }

      return 'Code execution produced no output'
    } catch (error) {
      return `Code execution failed: ${getErrorMessage(error)}`
    }
  },
}
