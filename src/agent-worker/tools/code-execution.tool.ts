/**
 * Code execution tool — uses the configured provider's hosted code runtime.
 * Replaces the old calculator tool — can run real Python, not just basic math.
 */

import { generateText, type ToolSet } from 'ai'

import {
  type AiModelConfig,
  type AiReasoningEffort,
  formatAiModelConfig,
  getAiSdkGoogleTools,
  getAiSdkLanguageModel,
  getAiSdkOpenAiTools,
  getAiSdkProviderOptions,
  getErrorMessage,
} from '@tg-bot/common'
import { TOOL_CALL_TIMEOUT_MS } from '../agent/config'
import {
  HELPER_TEXT_FALLBACK_MODEL_CONFIG,
  HELPER_TEXT_FALLBACK_REASONING_EFFORT,
  HELPER_TEXT_MODEL_CONFIG,
  HELPER_TEXT_MODEL_REASONING_EFFORT,
} from '../agent/models'
import type { AgentTool } from '../types'
import { requireToolContext, trackToolModelCall } from './context'

function isSameModel(a: AiModelConfig, b: AiModelConfig): boolean {
  return a.provider === b.provider && a.model === b.model
}

function getCodeExecutionTools(modelConfig: AiModelConfig): ToolSet {
  if (modelConfig.provider === 'google') {
    return { code_execution: getAiSdkGoogleTools().codeExecution({}) }
  }

  return { code_interpreter: getAiSdkOpenAiTools().codeInterpreter({}) }
}

async function executeCodeWithModel(
  task: string,
  chatId: number,
  modelConfig: AiModelConfig,
  reasoningEffort: AiReasoningEffort,
  fallbackFrom?: string,
) {
  return trackToolModelCall(
    {
      name: 'code_execution',
      model: formatAiModelConfig(modelConfig),
      fallbackFrom,
      classifyResult: (response) =>
        response.text.trim() ? 'success' : 'error',
    },
    () =>
      generateText({
        model: getAiSdkLanguageModel(modelConfig),
        prompt: task,
        tools: getCodeExecutionTools(modelConfig),
        toolChoice: 'auto',
        maxRetries: 0,
        timeout: TOOL_CALL_TIMEOUT_MS,
        providerOptions: getAiSdkProviderOptions(modelConfig, {
          reasoningEffort,
          chatId,
          store: false,
          serviceTier:
            modelConfig.provider === 'google' ? 'priority' : undefined,
        }),
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
      return 'Error: task cannot be empty'
    }

    try {
      let result: Awaited<ReturnType<typeof executeCodeWithModel>>
      try {
        result = await executeCodeWithModel(
          task,
          message.chat.id,
          HELPER_TEXT_MODEL_CONFIG,
          HELPER_TEXT_MODEL_REASONING_EFFORT,
        )
      } catch (primaryError) {
        if (
          isSameModel(
            HELPER_TEXT_MODEL_CONFIG,
            HELPER_TEXT_FALLBACK_MODEL_CONFIG,
          )
        ) {
          throw primaryError
        }

        result = await executeCodeWithModel(
          task,
          message.chat.id,
          HELPER_TEXT_FALLBACK_MODEL_CONFIG,
          HELPER_TEXT_FALLBACK_REASONING_EFFORT,
          formatAiModelConfig(HELPER_TEXT_MODEL_CONFIG),
        )
      }

      if (result.text.trim()) {
        return result.text.trim()
      }

      return 'Code execution produced no output'
    } catch (error) {
      return `Code execution failed: ${getErrorMessage(error)}`
    }
  },
}
