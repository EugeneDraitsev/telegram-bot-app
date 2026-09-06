/**
 * Code execution tool — uses the configured provider's hosted code runtime.
 * Replaces the old calculator tool — can run real Python, not just basic math.
 */

import { generateText, type ToolSet } from 'ai'

import {
  getAiSdkGoogleTools,
  getAiSdkLanguageModel,
  getAiSdkOpenAiTools,
  getErrorMessage,
} from '@tg-bot/common'
import { TOOL_CALL_TIMEOUT_MS } from '../agent/config'
import {
  CHAT_ROLE,
  getModelProviderOptions,
  type ModelChoice,
} from '../agent/models'
import type { AgentTool } from '../types'
import { requireToolContext, trackToolModelCall } from './context'

function getCodeExecutionTools(choice: ModelChoice): ToolSet {
  if (choice.config.provider === 'google') {
    return { code_execution: getAiSdkGoogleTools().codeExecution({}) }
  }

  return { code_interpreter: getAiSdkOpenAiTools().codeInterpreter({}) }
}

async function executeCodeWithModel(
  task: string,
  chatId: number,
  choice: ModelChoice,
  fallbackFrom?: string,
) {
  return trackToolModelCall(
    {
      name: 'code_execution',
      model: choice.label,
      fallbackFrom,
      classifyResult: (response) =>
        response.text.trim() ? 'success' : 'error',
    },
    () =>
      generateText({
        model: getAiSdkLanguageModel(choice.config),
        prompt: task,
        tools: getCodeExecutionTools(choice),
        toolChoice: 'auto',
        maxRetries: 0,
        timeout: TOOL_CALL_TIMEOUT_MS,
        providerOptions: getModelProviderOptions(choice, { chatId }),
      }),
  )
}

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
    const { message } = requireToolContext()
    const task = (args.task as string)?.trim()
    if (!task) {
      throw new Error('Task cannot be empty')
    }

    try {
      let result: Awaited<ReturnType<typeof executeCodeWithModel>>
      try {
        result = await executeCodeWithModel(
          task,
          message.chat.id,
          CHAT_ROLE.primary,
        )
      } catch {
        result = await executeCodeWithModel(
          task,
          message.chat.id,
          CHAT_ROLE.fallback,
          CHAT_ROLE.primary.label,
        )
      }

      if (result.text.trim()) {
        return result.text.trim()
      }

      throw new Error('Code execution produced no output')
    } catch (error) {
      throw new Error(`Code execution failed: ${getErrorMessage(error)}`)
    }
  },
}
