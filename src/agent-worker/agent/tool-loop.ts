import type { ModelMessage, ToolSet, UserModelMessage } from 'ai'

import type { MetricStatus } from '@tg-bot/common'
import { cleanModelMessage, logger, recordMetric } from '@tg-bot/common'
import {
  getCollectedResponses,
  getToolMetricAttribution,
  type RegisteredToolMedia,
  runWithToolCallContext,
  takePendingModelInspectionImages,
} from '../tools'
import type { AgentTool, AgentToolExecutionPolicy } from '../types'
import { MAX_SERIAL_TOOL_CALLS_PER_ROUND, TOOL_CALL_TIMEOUT_MS } from './config'
import { generateModelWithRetry, type ModelCallResult } from './model-call'
import type { ChatRole, ModelChoice } from './models'
import { extractErrorInfo, withTimeout } from './utils'

const TOOL_RESULT_FALLBACK_MAX_CHARS = 3_500

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
  call: Pick<ExecutableFunctionCall, 'name'>,
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

/**
 * Salvages an answer when the model wrote none. Only tools whose output is
 * already user-facing prose qualify; raw history, media ids or memory dumps
 * must never reach the chat.
 */
export function extractFallbackTextFromToolResults(
  toolResults: Array<Pick<ToolExecutionResult, 'name' | 'result' | 'status'>>,
  toolByName: Map<string, AgentTool>,
): string {
  const successfulResults = toolResults
    .filter(
      (result) =>
        result.status === 'success' &&
        hasExecutionPolicy(result, toolByName, 'presentable'),
    )
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
  model: string,
  workerDeadline: number,
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
  const logContext = {
    chatId,
    tool: name,
    toolCallId: toolCall.toolCallId,
    model,
    ...attribution,
  }
  logger.info({ ...logContext, payload: args }, 'tool.call')

  const toolStart = Date.now()
  try {
    const timeout = Math.min(
      tool.timeoutMs ?? TOOL_CALL_TIMEOUT_MS,
      workerDeadline - Date.now(),
    )
    // Never start a tool (and its paid side effects) that cannot finish.
    if (timeout <= 0) throw new ToolCallTimeoutError(0)
    const result = await withTimeout(
      runWithToolCallContext(
        { tool: name, toolCallId: toolCall.toolCallId, callerModel: model },
        () => tool.execute(args),
      ),
      timeout,
      new ToolCallTimeoutError(timeout),
    )

    const durationMs = Date.now() - toolStart
    logger.info({ ...logContext, durationMs, result }, 'tool.done')
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
        ...logContext,
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
  model: string,
  workerDeadline: number,
): Promise<Array<{ call: ExecutableFunctionCall } & ToolExecutionResult>> {
  const run = (call: ExecutableFunctionCall) =>
    executeToolCall(call, toolByName, chatId, model, workerDeadline).then(
      (result) => ({
        call,
        ...result,
      }),
    )

  // Serial (rate-limited) tools queue behind each other and are capped per
  // round; every other call runs in parallel alongside them.
  let serialQueue: Promise<unknown> = Promise.resolve()
  let serialCount = 0
  return Promise.all(
    calls.map((call) => {
      if (!hasExecutionPolicy(call, toolByName, 'serial')) return run(call)
      if (serialCount++ >= MAX_SERIAL_TOOL_CALLS_PER_ROUND) {
        return {
          call,
          name: call.name,
          result: `NOT EXECUTED - at most ${MAX_SERIAL_TOOL_CALLS_PER_ROUND} rate-limited calls can run in one round. Combine queries or request this call in the next round if still needed.`,
          status: 'error' as const,
        }
      }
      const result = serialQueue.then(() => run(call))
      serialQueue = result
      return result
    }),
  )
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

function buildModelInspectionMessage(
  images: RegisteredToolMedia[],
): ModelMessage | undefined {
  if (!images.length) return undefined

  const content: Exclude<UserModelMessage['content'], string> = [
    {
      type: 'text',
      text: 'SELECTED_HISTORY_IMAGES: these images were explicitly loaded for the current request. Inspect only these selected images and keep each image tied to its media_id and source message_id.',
    },
  ]
  for (const { media, mediaId } of images) {
    content.push({
      type: 'text',
      text: [
        `SELECTED_HISTORY_IMAGE media_id=${mediaId}`,
        media.context?.messageId === undefined
          ? undefined
          : `message_id=${media.context.messageId}`,
        `mime_type=${media.mimeType}`,
        media.context?.text
          ? `source_text=${JSON.stringify(media.context.text)}`
          : undefined,
        media.context?.author
          ? `source_author=${JSON.stringify(media.context.author)}`
          : undefined,
      ]
        .filter(Boolean)
        .join('\n'),
    })
    content.push({
      type: 'image',
      image: media.buffer,
      mediaType: media.mimeType,
    })
  }

  return { role: 'user', content }
}

export async function runToolLoop(
  input: ModelMessage[],
  systemInstruction: string,
  tools: ToolSet,
  toolByName: Map<string, AgentTool>,
  chatId: number,
  role: ChatRole,
  /** Epoch ms by which every model and tool call must stop. */
  workerDeadline = Number.POSITIVE_INFINITY,
): Promise<{ finalText: string; toolResults: ToolExecutionResult[] }> {
  let finalText = ''
  const toolResults: ToolExecutionResult[] = []
  const deadline = Date.now() + role.toolLoopBudgetMs
  // Set when the loop stops before the model has read the latest tool results.
  let toolResultsUnread = false
  let activeChoice = role.primary
  // Once the loop has switched to the fallback there is nothing left to fall
  // back to, so later iterations retry the fallback itself.
  let fallback: ModelChoice | undefined = role.fallback

  for (let iteration = 0; iteration < role.maxToolIterations; iteration++) {
    if (iteration > 0 && Date.now() >= deadline) {
      logger.warn(
        { chatId, model: activeChoice.label, iteration },
        'loop.budget_exhausted',
      )
      break
    }

    let modelResult: ModelCallResult<ToolSet>
    try {
      modelResult = await generateModelWithRetry(
        {
          messages: input,
          system: systemInstruction,
          tools: Object.keys(tools).length ? tools : undefined,
          toolChoice: 'auto',
        },
        {
          chatId,
          metricName: iteration === 0 ? 'routing' : `iteration_${iteration}`,
          choice: activeChoice,
          fallback,
          timeoutMs: role.timeoutMs,
          deadline: workerDeadline,
          attribution: getToolMetricAttribution(),
        },
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
            model: activeChoice.label,
            error: extractErrorInfo(error),
          },
          'loop.model_iteration_failed_after_tools',
        )
        // Every model just failed, so the final answer gets a single attempt.
        fallback = undefined
        break
      }

      throw error
    }
    activeChoice = modelResult.choice
    toolResultsUnread = false
    if (modelResult.fallbackFrom) fallback = undefined
    const { response } = modelResult

    const responseMessages = response.response.messages as ModelMessage[]
    const functionCalls = getExecutableFunctionCalls(response.toolCalls)
    logger.info(
      {
        chatId,
        model: activeChoice.label,
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
    // Only the latest round speaks for the loop: earlier text is interim
    // ("searching now...") and must not become the answer.
    finalText = response.text.trim()
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
          model: activeChoice.label,
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
      activeChoice.label,
      workerDeadline,
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

    // A failed terminal call goes back to the model like any other result.
    const allTerminalSucceeded = executionResults.every(
      ({ call, status }) =>
        status === 'success' &&
        hasExecutionPolicy(call, toolByName, 'terminal'),
    )
    if (
      allTerminalSucceeded &&
      getCollectedResponses().length > 0 &&
      !hasDeferred
    ) {
      logger.info(
        {
          chatId,
          model: activeChoice.label,
          tools: callsToExecute.map((call) => call.name),
        },
        'loop.terminal_tools_skip',
      )
      break
    }

    input.push({ role: 'tool', content: functionResponses })
    toolResultsUnread = true

    const inspectionImages = takePendingModelInspectionImages()
    const inspectionMessage = buildModelInspectionMessage(inspectionImages)
    if (inspectionMessage) {
      input.push(inspectionMessage)
      logger.info(
        {
          chatId,
          count: inspectionImages.length,
          mediaIds: inspectionImages.map(({ mediaId }) => mediaId),
        },
        'loop.selected_history_images_attached',
      )
    }
  }

  // Force a final synthesis pass without tools when the loop stopped before the
  // model read its last tool results, even if an earlier tool already
  // collected a response, or when nothing user-facing came out of the loop. A
  // terminal-tool stop never leaves results unread.
  if (
    toolResultsUnread ||
    (!finalText.trim() && getCollectedResponses().length === 0)
  ) {
    try {
      const finalizeResult = await generateModelWithRetry(
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
        },
        {
          chatId,
          metricName: 'finalize',
          choice: activeChoice,
          fallback,
          timeoutMs: role.timeoutMs,
          deadline: workerDeadline,
          attribution: getToolMetricAttribution(),
        },
      )
      activeChoice = finalizeResult.choice
      const finalizeText = finalizeResult.response.text.trim()
      if (finalizeText) {
        finalText = finalizeText
      } else {
        logger.warn(
          { chatId, model: activeChoice.label },
          'loop.finalize_empty',
        )
      }
    } catch (error) {
      logger.warn(
        { chatId, model: activeChoice.label, error: extractErrorInfo(error) },
        'loop.finalize_failed',
      )
    }
  }

  return { finalText, toolResults }
}
