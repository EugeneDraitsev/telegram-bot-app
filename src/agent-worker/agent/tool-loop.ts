import type { ModelMessage, ToolSet } from 'ai'

import type { AiModelConfig, MetricStatus } from '@tg-bot/common'
import {
  cleanModelMessage,
  formatAiModelConfig,
  logger,
  recordMetric,
} from '@tg-bot/common'
import { getCollectedResponses, getToolMetricAttribution } from '../tools'
import type { AgentTool, AgentToolExecutionPolicy } from '../types'
import { MAX_TOOL_ITERATIONS, TOOL_CALL_TIMEOUT_MS } from './config'
import {
  type GenerateModelWithRetryResult,
  generateModelWithRetryWithInfo,
} from './model-call'
import { extractErrorInfo, getChatProviderOptions } from './runtime'
import { withTimeout } from './utils'

const TOOL_RESULT_FALLBACK_MAX_CHARS = 3_500
const AGENT_ROUTING_MODEL_TIMEOUT_MS = 20_000
const MODEL_DELIVERY_RESERVE_MS = 20_000

function hasTimeForAnotherModelCall(
  getRemainingTimeInMillis: (() => number) | undefined,
): boolean {
  const remainingTimeMs = getRemainingTimeInMillis?.()
  return (
    remainingTimeMs === undefined ||
    !Number.isFinite(remainingTimeMs) ||
    remainingTimeMs >=
      AGENT_ROUTING_MODEL_TIMEOUT_MS + MODEL_DELIVERY_RESERVE_MS
  )
}

export type ExecutableFunctionCall = {
  toolCallId: string
  name: string
  args: Record<string, unknown>
}

export type ToolExecutionResult = {
  name: string
  result: string
  status: MetricStatus
}

function hasExecutionPolicy(
  call: ExecutableFunctionCall,
  toolByName: Map<string, AgentTool>,
  policy: AgentToolExecutionPolicy,
): boolean {
  return toolByName.get(call.name)?.execution?.includes(policy) ?? false
}

class ToolCallTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Tool timed out after ${timeoutMs}ms`)
    this.name = 'ToolCallTimeoutError'
  }
}

export function getExecutableFunctionCalls(
  toolCalls:
    | Array<{ toolCallId: string; toolName: string; input: unknown }>
    | undefined,
): ExecutableFunctionCall[] {
  return (toolCalls ?? [])
    .filter(
      (
        call,
      ): call is { toolCallId: string; toolName: string; input: unknown } =>
        typeof call.toolName === 'string' && call.toolName.length > 0,
    )
    .map((call) => ({
      toolCallId: call.toolCallId,
      name: call.toolName,
      args:
        call.input &&
        typeof call.input === 'object' &&
        !Array.isArray(call.input)
          ? (call.input as Record<string, unknown>)
          : {},
    }))
}

export function extractFallbackTextFromToolResults(
  toolResults: Array<Pick<ToolExecutionResult, 'result' | 'status'>>,
): string {
  const successfulResults = toolResults
    .filter(({ status }) => status === 'success')
    .map(({ result }) => result.trim())
    .filter(Boolean)

  if (!successfulResults.length) {
    return ''
  }

  return cleanModelMessage(successfulResults.join('\n\n'))
    .slice(0, TOOL_RESULT_FALLBACK_MAX_CHARS)
    .trim()
}

async function executeToolCall(
  toolCall: ExecutableFunctionCall,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<ToolExecutionResult> {
  const name = toolCall.name
  const tool = toolByName.get(name)
  if (!tool) {
    return {
      name,
      result: `Tool "${name}" not found`,
      status: 'error',
    }
  }

  const attribution = getToolMetricAttribution()
  const args = toolCall.args
  logger.info(
    { chatId, tool: name, ...attribution, payload: args },
    'tool.call',
  )

  const toolStart = Date.now()
  try {
    const timeout = tool.timeoutMs ?? TOOL_CALL_TIMEOUT_MS
    const result = await withTimeout(
      tool.execute(args),
      timeout,
      new ToolCallTimeoutError(timeout),
    )

    const durationMs = Date.now() - toolStart
    logger.info(
      { chatId, tool: name, ...attribution, durationMs, result },
      'tool.done',
    )
    await recordMetric({
      type: 'tool_call',
      ...attribution,
      name,
      chatId,
      durationMs,
      success: true,
      status: 'success',
      timestamp: Date.now(),
    })
    return { name, result, status: 'success' }
  } catch (error) {
    const durationMs = Date.now() - toolStart
    const errorMsg = error instanceof Error ? error.message : String(error)
    const status = error instanceof ToolCallTimeoutError ? 'timeout' : 'error'
    logger.error(
      {
        chatId,
        tool: name,
        ...attribution,
        durationMs,
        error: errorMsg,
        status,
      },
      'tool.failed',
    )
    await recordMetric({
      type: 'tool_call',
      ...attribution,
      name,
      chatId,
      durationMs,
      success: false,
      status,
      timestamp: Date.now(),
    })
    return { name, result: errorMsg, status }
  }
}

async function executeToolCalls(
  calls: ExecutableFunctionCall[],
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<Array<{ call: ExecutableFunctionCall } & ToolExecutionResult>> {
  const run = (call: ExecutableFunctionCall) =>
    executeToolCall(call, toolByName, chatId).then((result) => ({
      call,
      ...result,
    }))

  if (calls.some((call) => hasExecutionPolicy(call, toolByName, 'serial'))) {
    const results: Array<
      {
        call: ExecutableFunctionCall
      } & ToolExecutionResult
    > = []
    for (const call of calls) results.push(await run(call))
    return results
  }

  return Promise.all(calls.map(run))
}

function buildFunctionResponsePart(
  call: ExecutableFunctionCall,
  output: string,
  status: MetricStatus = 'success',
) {
  return {
    type: 'tool-result' as const,
    toolCallId: call.toolCallId,
    toolName: call.name,
    output:
      status === 'success'
        ? { type: 'text' as const, value: output }
        : { type: 'error-text' as const, value: output },
  }
}

export async function runToolLoop(
  input: ModelMessage[],
  systemInstruction: string,
  tools: ToolSet,
  toolByName: Map<string, AgentTool>,
  chatId: number,
  initialModelConfig: AiModelConfig,
  options: { getRemainingTimeInMillis?: () => number } = {},
): Promise<{ finalText: string; toolResults: ToolExecutionResult[] }> {
  let finalText = ''
  const toolResults: ToolExecutionResult[] = []
  let activeModelConfig = initialModelConfig
  let activeModel = formatAiModelConfig(initialModelConfig)

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    if (!hasTimeForAnotherModelCall(options.getRemainingTimeInMillis)) {
      logger.warn({ chatId, iteration }, 'loop.remaining_time_guard')
      break
    }

    let modelResult: GenerateModelWithRetryResult<ToolSet>
    try {
      modelResult = await generateModelWithRetryWithInfo(
        {
          messages: input,
          system: systemInstruction,
          tools: Object.keys(tools).length ? tools : undefined,
          toolChoice: 'auto',
          providerOptions: getChatProviderOptions(activeModelConfig, chatId),
        },
        chatId,
        iteration === 0 ? 'routing' : `iteration_${iteration}`,
        activeModelConfig,
        AGENT_ROUTING_MODEL_TIMEOUT_MS,
        getToolMetricAttribution(),
      )
    } catch (error) {
      if (
        iteration > 0 &&
        (toolResults.length || getCollectedResponses().length)
      ) {
        logger.warn(
          {
            chatId,
            iteration,
            model: activeModel,
            error: extractErrorInfo(error),
          },
          'loop.model_iteration_failed_after_tools',
        )
        break
      }

      throw error
    }
    activeModelConfig = modelResult.modelConfig
    activeModel = modelResult.model
    const { response } = modelResult

    const responseMessages = response.response.messages as ModelMessage[]
    const functionCalls = getExecutableFunctionCalls(response.toolCalls)
    logger.info(
      {
        chatId,
        model: activeModel,
        ...(modelResult.fallbackFrom
          ? { fallbackFrom: modelResult.fallbackFrom }
          : {}),
        iteration,
        outputTypes: response.content.map((part) => part.type),
        functionCalls: functionCalls.map((call) => call.name),
        usedWebSearch: functionCalls.some((call) => call.name === 'web_search'),
      },
      'loop.model_response',
    )
    const text = response.text.trim()

    if (text) finalText = text
    if (functionCalls.length === 0) break

    // If a round has both data-gathering and content-creating tools, defer
    // content tools so they run after data is available in the next iteration.
    const dataCalls = functionCalls.filter(
      (call) => !hasExecutionPolicy(call, toolByName, 'after-data'),
    )
    const contentCalls = functionCalls.filter((call) =>
      hasExecutionPolicy(call, toolByName, 'after-data'),
    )
    const hasDeferred = dataCalls.length > 0 && contentCalls.length > 0
    const callsToExecute = hasDeferred ? dataCalls : functionCalls

    if (hasDeferred) {
      logger.info(
        {
          chatId,
          model: activeModel,
          iteration,
          deferred: contentCalls.map((call) => call.name),
        },
        'loop.deferred_content_tools',
      )
    }

    input.push(...responseMessages)

    const executionResults = await executeToolCalls(
      callsToExecute,
      toolByName,
      chatId,
    )
    toolResults.push(
      ...executionResults.map(({ name, result, status }) => ({
        name,
        result,
        status,
      })),
    )

    const functionResponses = [
      ...executionResults.map((result) =>
        buildFunctionResponsePart(result.call, result.result, result.status),
      ),
      ...(hasDeferred
        ? contentCalls.map((call) =>
            buildFunctionResponsePart(
              call,
              'NOT EXECUTED YET - data was just fetched. Call this tool again now with the actual data.',
            ),
          )
        : []),
    ]

    const allTerminal = callsToExecute.every((call) =>
      hasExecutionPolicy(call, toolByName, 'terminal'),
    )
    if (allTerminal && getCollectedResponses().length > 0 && !hasDeferred) {
      logger.info(
        {
          chatId,
          model: activeModel,
          tools: callsToExecute.map((call) => call.name),
        },
        'loop.terminal_tools_skip',
      )
      break
    }

    input.push({ role: 'tool', content: functionResponses })
  }

  // If no user-facing response came out of the loop, force a final synthesis
  // pass without tools. Terminal tools already collected their own response.
  if (
    !finalText.trim() &&
    getCollectedResponses().length === 0 &&
    hasTimeForAnotherModelCall(options.getRemainingTimeInMillis)
  ) {
    try {
      const finalizeResult = await generateModelWithRetryWithInfo(
        {
          messages: [
            ...input,
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Provide the final user-facing answer now. Use plain text only and do not call tools. Use successful tool results as the primary evidence. If any tool failed or timed out, explicitly say you could not verify that part instead of guessing.',
                },
              ],
            },
          ],
          system: systemInstruction,
          toolChoice: 'none',
          providerOptions: getChatProviderOptions(activeModelConfig, chatId),
        },
        chatId,
        'finalize',
        activeModelConfig,
        AGENT_ROUTING_MODEL_TIMEOUT_MS,
        getToolMetricAttribution(),
      )
      activeModel = finalizeResult.model
      const finalizeText = finalizeResult.response.text.trim()
      if (finalizeText) {
        finalText = finalizeText
      } else {
        logger.warn({ chatId, model: activeModel }, 'loop.finalize_empty')
      }
    } catch (error) {
      logger.warn(
        { chatId, model: activeModel, error: extractErrorInfo(error) },
        'loop.finalize_failed',
      )
    }
  }

  return { finalText, toolResults }
}
