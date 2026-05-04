import {
  type Content,
  type FunctionCall,
  FunctionCallingConfigMode,
  type FunctionDeclaration,
  type Part,
  ServiceTier,
  type Tool,
} from '@google/genai'
import type { Message } from 'telegram-typings'

import type { HistoryMediaAttachment, MediaBuffer } from '@tg-bot/common'
import {
  AGENT_REACTION,
  type BotIdentity,
  cleanGeminiMessage,
  collectHistoryMediaFileRefs,
  collectMediaFileRefs,
  DEFAULT_AGENT_HISTORY_LIMIT,
  formatHistoryForDisplay,
  getChatMemory,
  getGlobalMemory,
  getMessageLogMeta,
  getMetricStatusFromError,
  getRecentRawHistory,
  logger,
  type MetricStatus,
  recordMetric,
  resolveHistoryMediaAttachments,
  startTypingIndicator,
} from '@tg-bot/common'
import { IMAGE_MODEL } from '../services/openai-image'
import { VOICE_MODEL } from '../services/openai-tts'
import { WEB_SEARCH_MODEL } from '../services/openai-web-search'
import {
  executeDynamicCommandFromMessage,
  getAgentTools,
  getCollectedResponses,
  runWithToolContext,
} from '../tools'
import type { AgentResponse, AgentTool, TelegramApi } from '../types'
import {
  CONTENT_TOOLS,
  MAX_TOOL_ITERATIONS,
  TERMINAL_TOOLS,
  TOOL_CALL_TIMEOUT_MS,
} from './config'
import { buildContextBlock, buildMemoryBlock, splitResponses } from './context'
import { sendResponses } from './delivery'
import {
  generateGeminiWithRetry,
  isRetryableModelError,
  ModelCallTimeoutError,
} from './model-call'
import {
  CHAT_MODEL,
  CHAT_MODEL_REASONING_EFFORT,
  FAST_MODEL,
  REPLY_GATE_MODEL,
} from './models'
import { shouldEngageWithMessage } from './reply-gate'
import { agentSystemInstructions } from './system-instructions'
import { withTimeout } from './utils'

// ── Helpers ──────────────────────────────────────────────────

function buildSystemInstruction(
  contextBlock: string,
  memoryBlock?: string,
): string {
  const parts = [agentSystemInstructions, contextBlock]
  if (memoryBlock) parts.push(memoryBlock)
  return parts.join('\n\n')
}

function getRecentHistoryContext(
  messages: Message[],
  currentMessageId?: number,
): string {
  const history = formatHistoryForDisplay(messages, {
    limit: DEFAULT_AGENT_HISTORY_LIMIT,
    includeHeader: false,
    excludeMessageId: currentMessageId,
  })
  return history === 'No message history available' ? '' : history
}

function buildNativeTools(agentTools: AgentTool[]): Tool[] {
  const functionDeclarations: FunctionDeclaration[] = agentTools
    .filter((tool) => tool.exposeToModel !== false)
    .map((tool) => ({
      name: tool.declaration.name,
      description: tool.declaration.description,
      parametersJsonSchema: tool.declaration.parameters ?? {
        type: 'object',
        properties: {},
      },
    }))

  return functionDeclarations.length ? [{ functionDeclarations }] : []
}

/** Maps tool names to their underlying AI model for metrics */
const TOOL_MODELS: Record<string, string> = {
  web_search: WEB_SEARCH_MODEL,
  generate_or_edit_image: IMAGE_MODEL,
  generate_voice: VOICE_MODEL,
  search_video: WEB_SEARCH_MODEL,
  code_execution: FAST_MODEL,
}
const RATE_LIMITED_TOOLS = new Set(['web_search', 'search_video'])

const MAX_HISTORY_IMAGE_ATTACHMENTS = 4

type ExecutableFunctionCall = {
  id?: string
  name: string
  args: Record<string, unknown>
}

function getExecutableFunctionCalls(
  functionCalls: FunctionCall[] | undefined,
): ExecutableFunctionCall[] {
  return (functionCalls ?? [])
    .filter(
      (call): call is FunctionCall & { name: string } =>
        typeof call.name === 'string' && call.name.length > 0,
    )
    .map((call) => ({
      id: call.id,
      name: call.name,
      args: call.args ?? {},
    }))
}

function getHistoryMediaPrompt(message: Message): string {
  const sourceText = (message.caption || message.text || '').trim()
  return sourceText
    ? `Context image from recent chat history. Related message text: ${sourceText.slice(0, 200)}`
    : 'Context image from recent chat history.'
}

function getToolModel(toolName: string): string {
  return TOOL_MODELS[toolName] ?? 'none'
}

function getToolResultStatus(result: string): MetricStatus {
  const normalized = result.trim().toLowerCase()
  if (normalized.includes('timed out')) return 'timeout'
  if (
    normalized.startsWith('error:') ||
    normalized.startsWith('error generating image:') ||
    normalized.startsWith('error generating voice:') ||
    normalized.startsWith('url read failed:') ||
    normalized.startsWith('code execution failed:') ||
    normalized.startsWith('could not ') ||
    normalized.includes(' failed:') ||
    normalized.includes(' no output') ||
    normalized.includes('cannot be empty')
  ) {
    return 'error'
  }
  return 'success'
}

function parseToolArguments(
  rawArguments: Record<string, unknown>,
  chatId: number,
  toolName: string,
): { ok: true; args: Record<string, unknown> } | { ok: false; result: string } {
  if (
    !rawArguments ||
    typeof rawArguments !== 'object' ||
    Array.isArray(rawArguments)
  ) {
    const result = `Error: invalid tool arguments for "${toolName}". Arguments must be an object.`
    logger.warn(
      { chatId, tool: toolName, rawArguments },
      'tool.arguments_parse_failed',
    )
    return { ok: false, result }
  }

  return { ok: true, args: rawArguments }
}

async function executeToolCall(
  toolCall: ExecutableFunctionCall,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<{ name: string; result: string }> {
  const name = toolCall.name
  const tool = toolByName.get(name)
  if (!tool) return { name, result: `Error: tool "${name}" not found` }

  const model = getToolModel(name)
  const parsedArgs = parseToolArguments(toolCall.args, chatId, name)
  if (!parsedArgs.ok) {
    void recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name,
      model,
      chatId,
      durationMs: 0,
      success: false,
      status: 'error',
      timestamp: Date.now(),
    })
    return { name, result: parsedArgs.result }
  }

  const args = parsedArgs.args
  logger.info({ chatId, tool: name, model, payload: args }, 'tool.call')

  const toolStart = Date.now()
  try {
    const timeout = tool.timeoutMs ?? TOOL_CALL_TIMEOUT_MS
    const result = await withTimeout(
      tool.execute(args),
      timeout,
      `Tool timed out after ${timeout}ms`,
    )

    const durationMs = Date.now() - toolStart
    const status = getToolResultStatus(result)
    if (status === 'success') {
      logger.info(
        { chatId, tool: name, model, durationMs, result },
        'tool.done',
      )
    } else {
      logger.warn(
        { chatId, tool: name, model, durationMs, result, status },
        'tool.done_non_success',
      )
    }
    void recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name,
      model,
      chatId,
      durationMs,
      success: status === 'success',
      status,
      timestamp: Date.now(),
    })
    return { name, result }
  } catch (error) {
    const durationMs = Date.now() - toolStart
    const errorMsg = error instanceof Error ? error.message : String(error)
    const status = getMetricStatusFromError(error)
    logger.error(
      { chatId, tool: name, model, durationMs, error: errorMsg, status },
      'tool.failed',
    )
    void recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name,
      model,
      chatId,
      durationMs,
      success: false,
      status,
      timestamp: Date.now(),
    })
    return { name, result: `Error: ${errorMsg}` }
  }
}

async function executeToolCalls(
  calls: ExecutableFunctionCall[],
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<
  Array<{ call: ExecutableFunctionCall; name: string; result: string }>
> {
  const run = (call: ExecutableFunctionCall) =>
    executeToolCall(call, toolByName, chatId).then((r) => ({
      call,
      ...r,
    }))

  // Run sequentially when search-backed tools are present (rate limiting).
  if (calls.some((c) => RATE_LIMITED_TOOLS.has(c.name))) {
    const results: Array<{
      call: ExecutableFunctionCall
      name: string
      result: string
    }> = []
    for (const call of calls) results.push(await run(call))
    return results
  }

  return Promise.all(calls.map(run))
}

function extractErrorInfo(error: unknown): unknown {
  if (!(error instanceof Error)) return error
  const record = error as unknown as Record<string, unknown>
  return {
    name: error.name,
    message: error.message,
    ...('status' in error ? { status: record.status } : {}),
    ...('statusText' in error ? { statusText: record.statusText } : {}),
    ...('errorDetails' in error ? { errorDetails: record.errorDetails } : {}),
  }
}

function extractFallbackTextFromToolResults(results: string[]): string | null {
  const successfulResults = results.filter(
    (result) => result.trim() && !result.startsWith('Error:'),
  )
  return successfulResults.length
    ? [...new Set(successfulResults)].slice(0, 2).join('\n\n')
    : null
}

function getLoopFailureReply(error: unknown): string {
  if (error instanceof ModelCallTimeoutError || isRetryableModelError(error)) {
    return 'Сервис ответа сейчас перегружен. Попробуй ещё раз чуть позже.'
  }
  return 'Что-то пошло не так 😵'
}

// ── Content building ─────────────────────────────────────────

function pushImageContent(parts: Part[], label: string, media: MediaBuffer) {
  parts.push({ text: label })
  parts.push({
    inlineData: {
      data: media.buffer.toString('base64'),
      mimeType: media.mimeType,
    },
  })
}

function buildInitialInput(
  message: Message,
  textContent: string,
  mediaBuffers: MediaBuffer[] | undefined,
  historyMediaAttachments: HistoryMediaAttachment[],
): Content[] {
  const parts: Part[] = []

  for (const media of mediaBuffers ?? []) {
    pushImageContent(parts, media.label || 'Request media', media)
  }

  if (message.reply_to_message) {
    const replyText =
      message.reply_to_message.text || message.reply_to_message.caption
    const replyId = message.reply_to_message.message_id
    const replyLabel =
      typeof replyId === 'number'
        ? `Telegram reply target message_id=${replyId}`
        : 'Telegram reply target'

    parts.push({ text: `${replyLabel}: ${replyText || '[media]'}` })
  }

  for (const { media, message: srcMsg } of historyMediaAttachments) {
    pushImageContent(parts, getHistoryMediaPrompt(srcMsg), media)
  }

  parts.push({ text: textContent || '[User sent media without text]' })

  return [{ role: 'user', parts }]
}

// ── Model loop ───────────────────────────────────────────────

function buildGeminiConfig(
  systemInstruction: string,
  tools: Tool[],
  mode: FunctionCallingConfigMode = FunctionCallingConfigMode.AUTO,
) {
  return {
    systemInstruction,
    serviceTier: ServiceTier.PRIORITY,
    ...(tools.length ? { tools } : {}),
    toolConfig: {
      functionCallingConfig: { mode },
    },
  }
}

function buildFunctionResponsePart(
  call: ExecutableFunctionCall,
  output: string,
): Part {
  return {
    functionResponse: {
      id: call.id,
      name: call.name,
      response: { output },
    },
  }
}

async function runToolLoop(
  input: Content[],
  systemInstruction: string,
  tools: Tool[],
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<{ finalText: string; toolResults: string[] }> {
  let finalText = ''
  const toolResults: string[] = []

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await generateGeminiWithRetry(
      {
        model: CHAT_MODEL,
        contents: input,
        config: buildGeminiConfig(systemInstruction, tools),
      },
      chatId,
      iteration === 0 ? 'routing' : `iteration_${iteration}`,
    )

    const responseParts = response.candidates?.[0]?.content?.parts ?? []
    const functionCalls = getExecutableFunctionCalls(response.functionCalls)
    logger.info(
      {
        chatId,
        model: CHAT_MODEL,
        iteration,
        outputTypes: responseParts.map((part) =>
          part.functionCall ? 'function_call' : part.text ? 'text' : 'part',
        ),
        functionCalls: functionCalls.map((call) => call.name),
        usedWebSearch: functionCalls.some((call) => call.name === 'web_search'),
      },
      'loop.model_response',
    )
    const text = response.text?.trim() ?? ''

    if (text) finalText = text
    if (functionCalls.length === 0) break

    // If a round has both data-gathering and content-creating tools, defer
    // content tools so they run after data is available in the next iteration.
    const dataCalls = functionCalls.filter((fc) => !CONTENT_TOOLS.has(fc.name))
    const contentCalls = functionCalls.filter((fc) =>
      CONTENT_TOOLS.has(fc.name),
    )
    const hasDeferred = dataCalls.length > 0 && contentCalls.length > 0
    const callsToExecute = hasDeferred ? dataCalls : functionCalls

    if (hasDeferred) {
      logger.info(
        {
          chatId,
          model: CHAT_MODEL,
          iteration,
          deferred: contentCalls.map((fc) => fc.name),
        },
        'loop.deferred_content_tools',
      )
    }

    input.push({
      role: 'model',
      parts: responseParts,
    })

    const executionResults = await executeToolCalls(
      callsToExecute,
      toolByName,
      chatId,
    )
    toolResults.push(...executionResults.map((tr) => tr.result))

    const functionResponses: Part[] = [
      ...executionResults.map((tr) =>
        buildFunctionResponsePart(tr.call, tr.result),
      ),
      ...(hasDeferred
        ? contentCalls.map((fc) =>
            buildFunctionResponsePart(
              fc,
              'NOT EXECUTED YET - data was just fetched. Call this tool again now with the actual data.',
            ),
          )
        : []),
    ]

    const allTerminal = callsToExecute.every((fc) =>
      TERMINAL_TOOLS.has(fc.name),
    )
    if (allTerminal && getCollectedResponses().length > 0 && !hasDeferred) {
      logger.info(
        {
          chatId,
          model: CHAT_MODEL,
          tools: callsToExecute.map((fc) => fc.name),
        },
        'loop.terminal_tools_skip',
      )
      break
    }

    input.push({ role: 'user', parts: functionResponses })
  }

  // If no text came out of the loop, force a final synthesis pass without tools.
  if (!finalText.trim()) {
    try {
      const finalizeResponse = await generateGeminiWithRetry(
        {
          model: CHAT_MODEL,
          contents: [
            ...input,
            {
              role: 'user',
              parts: [
                {
                  text: 'Provide the final user-facing answer now. Use plain text only and do not call tools. Use successful tool results as the primary evidence. If any tool failed or timed out, explicitly say you could not verify that part instead of guessing.',
                },
              ],
            },
          ],
          config: buildGeminiConfig(
            systemInstruction,
            [],
            FunctionCallingConfigMode.NONE,
          ),
        },
        chatId,
        'finalize',
      )
      const finalizeText = finalizeResponse.text?.trim() ?? ''
      if (finalizeText) {
        finalText = finalizeText
      } else {
        logger.warn({ chatId, model: CHAT_MODEL }, 'loop.finalize_empty')
      }
    } catch (error) {
      logger.warn(
        { chatId, model: CHAT_MODEL, error: extractErrorInfo(error) },
        'loop.finalize_failed',
      )
    }
  }

  return { finalText, toolResults }
}

// ── Main entry ───────────────────────────────────────────────

export async function runAgenticLoop(
  message: Message,
  api: TelegramApi,
  mediaBuffers?: MediaBuffer[],
  botInfo?: BotIdentity,
): Promise<void> {
  const startedAt = Date.now()
  const chatId = message.chat?.id
  if (!chatId) {
    logger.error({ reason: 'missing_chat_id' }, 'loop.invalid_input')
    return
  }

  const messageMeta = getMessageLogMeta(message)
  logger.info(
    {
      ...messageMeta,
      model: CHAT_MODEL,
      reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
      replyGateModel: REPLY_GATE_MODEL,
    },
    'loop.start',
  )

  let stopTyping: (() => void) | undefined

  try {
    await runWithToolContext(message, mediaBuffers, async () => {
      const textContent = message.text || message.caption || ''
      const hasMedia =
        !!mediaBuffers?.length || collectMediaFileRefs(message).length > 0

      const dynamicCommand = await executeDynamicCommandFromMessage(message)
      if (dynamicCommand.matched) {
        const responsesToSend: AgentResponse[] = [...getCollectedResponses()]
        const hasTextResponse = responsesToSend.some(
          (response) => response.type === 'text',
        )
        if (!hasTextResponse) {
          responsesToSend.push({
            type: 'text',
            text: cleanGeminiMessage(
              dynamicCommand.result ||
                `Команда /${dynamicCommand.name} ничего не вернула.`,
            ),
          })
        }

        const deliveryStart = Date.now()
        await sendResponses({
          responses: responsesToSend,
          chatId,
          replyToMessageId: message.message_id,
          api,
        })

        logger.info(
          {
            ...messageMeta,
            durationMs: Date.now() - startedAt,
            deliveryDurationMs: Date.now() - deliveryStart,
            commandName: dynamicCommand.name,
            ...(dynamicCommand.model ? { model: dynamicCommand.model } : {}),
            responseCount: responsesToSend.length,
          },
          'loop.dynamic_command_done',
        )
        return
      }

      // Load memory first — needed by the reply gate
      const [chatMemory, globalMemory] = await Promise.all([
        getChatMemory(chatId).catch(() => ''),
        getGlobalMemory().catch(() => ''),
      ])
      const memoryBlock = buildMemoryBlock(chatMemory, globalMemory)

      const shouldRespond = await shouldEngageWithMessage({
        message,
        textContent,
        hasMedia,
        memoryBlock,
        botInfo,
      })
      if (!shouldRespond) {
        logger.info(
          { ...messageMeta, reason: 'reply_gate', model: REPLY_GATE_MODEL },
          'loop.skipped',
        )
        return
      }

      void api
        .setMessageReaction?.(chatId, message.message_id, [
          { type: 'emoji', emoji: AGENT_REACTION },
        ])
        .catch(() => undefined)

      stopTyping = startTypingIndicator({
        chatId,
        sendChatAction: api.sendChatAction?.bind(api),
        onError: (error) => logger.warn({ chatId, error }, 'typing.failed'),
      })

      // Load tools + history in parallel (only after gate confirms we'll respond)
      const [agentTools, rawHistory] = await Promise.all([
        getAgentTools(chatId).catch((error) => {
          logger.error({ chatId, error }, 'tools.load_failed')
          return [] as AgentTool[]
        }),
        getRecentRawHistory(chatId, DEFAULT_AGENT_HISTORY_LIMIT + 1).catch(
          (error) => {
            logger.warn({ chatId, error }, 'history.preload_failed')
            return [] as Message[]
          },
        ),
      ])

      const recentHistory = getRecentHistoryContext(
        rawHistory,
        message.message_id,
      )
      const requestMediaFileIds = new Set(
        (mediaBuffers ?? [])
          .map(({ fileId }) => fileId)
          .filter((id): id is string => Boolean(id)),
      )
      const requestMediaFileUniqueIds = new Set(
        (mediaBuffers ?? [])
          .map(({ fileUniqueId }) => fileUniqueId)
          .filter((id): id is string => Boolean(id)),
      )

      const historyImageRefs = collectHistoryMediaFileRefs(rawHistory, {
        excludeMessageId: message.message_id,
        excludeFileIds: requestMediaFileIds,
        excludeFileUniqueIds: requestMediaFileUniqueIds,
        limit: DEFAULT_AGENT_HISTORY_LIMIT,
        mediaTypes: ['image'],
      }).slice(-MAX_HISTORY_IMAGE_ATTACHMENTS)

      const historyMediaAttachments = historyImageRefs.length
        ? await resolveHistoryMediaAttachments(historyImageRefs, api).catch(
            (error) => {
              logger.warn({ chatId, error }, 'history.media_preload_failed')
              return [] as HistoryMediaAttachment[]
            },
          )
        : []

      const allMediaBuffers = [
        ...(mediaBuffers ?? []),
        ...historyMediaAttachments.map((e) => e.media),
      ]

      const contextBlock = buildContextBlock(
        message,
        textContent,
        hasMedia,
        allMediaBuffers,
        {
          recentHistory,
        },
      )
      const systemInstruction = buildSystemInstruction(
        contextBlock,
        memoryBlock,
      )
      const tools = buildNativeTools(agentTools)
      const toolByName = new Map<string, AgentTool>(
        agentTools
          .filter(
            (t) => t.exposeToModel !== false && t.declaration.name != null,
          )
          .map((t) => [t.declaration.name ?? '', t]),
      )
      logger.info(
        {
          chatId,
          model: CHAT_MODEL,
          reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
          exposedTools: tools.flatMap(
            (tool) =>
              tool.functionDeclarations?.map((fn) => fn.name ?? 'function') ??
              Object.keys(tool),
          ),
          hiddenTools: agentTools
            .filter((tool) => tool.exposeToModel === false)
            .map((tool) => tool.declaration.name),
        },
        'loop.tools_ready',
      )

      const input = buildInitialInput(
        message,
        textContent,
        mediaBuffers,
        historyMediaAttachments,
      )

      const { finalText, toolResults } = await runToolLoop(
        input,
        systemInstruction,
        tools,
        toolByName,
        chatId,
      )

      // Collect any responses produced by tools (media, text drafts, etc.)
      const { textDrafts, mediaResponses } = splitResponses(
        getCollectedResponses(),
      )
      const responsesToSend: AgentResponse[] = [...mediaResponses]

      const allTextParts: string[] = [...textDrafts]
      if (finalText.trim()) {
        allTextParts.push(cleanGeminiMessage(finalText))
      } else {
        const fallback = extractFallbackTextFromToolResults(toolResults)
        if (fallback) {
          allTextParts.push(cleanGeminiMessage(fallback))
          logger.warn(
            { chatId, model: CHAT_MODEL },
            'loop.fallback_from_tool_result',
          )
        }
      }

      const combinedText = allTextParts.join('\n\n').trim()
      if (combinedText)
        responsesToSend.push({ type: 'text', text: combinedText })

      if (responsesToSend.length === 0) {
        responsesToSend.push({
          type: 'text',
          text: 'Не смог собрать ответ по этому запросу. Попробуй переформулировать.',
        })
        logger.warn(
          {
            ...messageMeta,
            model: CHAT_MODEL,
            durationMs: Date.now() - startedAt,
          },
          'loop.no_response_fallback_text',
        )
      }

      const deliveryStart = Date.now()
      await sendResponses({
        responses: responsesToSend,
        chatId,
        replyToMessageId: message.message_id,
        api,
      })

      logger.info(
        {
          ...messageMeta,
          model: CHAT_MODEL,
          reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
          durationMs: Date.now() - startedAt,
          deliveryDurationMs: Date.now() - deliveryStart,
          responseCount: responsesToSend.length,
          inputMediaCount: allMediaBuffers.length,
          outputMediaCount: mediaResponses.length,
          hasFinalText: Boolean(combinedText),
        },
        'loop.done',
      )
    })
  } catch (error) {
    logger.error(
      {
        ...messageMeta,
        model: CHAT_MODEL,
        reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
        durationMs: Date.now() - startedAt,
        error: extractErrorInfo(error),
      },
      'loop.failed',
    )
    try {
      await api.sendMessage(chatId, getLoopFailureReply(error), {
        reply_parameters: { message_id: message.message_id },
      })
    } catch (sendError) {
      logger.error({ chatId, sendError }, 'loop.error_reply_failed')
    }
  } finally {
    stopTyping?.()
  }
}
