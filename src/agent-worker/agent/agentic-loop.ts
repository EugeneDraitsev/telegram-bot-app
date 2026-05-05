import {
  jsonSchema,
  tool as defineAiTool,
  type JSONSchema7,
  type JSONValue,
  type ModelMessage,
  type ToolSet,
} from 'ai'
import type { Message } from 'telegram-typings'

import type { HistoryMediaAttachment, MediaBuffer } from '@tg-bot/common'
import {
  AGENT_REACTION,
  type BotIdentity,
  cleanModelMessage,
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
  setToolMediaBuffers,
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
  generateModelWithRetry,
  isRetryableModelError,
  ModelCallTimeoutError,
} from './model-call'
import {
  CHAT_MODEL,
  CHAT_MODEL_CONFIG,
  CHAT_MODEL_LABEL,
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

export function buildNativeTools(agentTools: AgentTool[]): ToolSet {
  return Object.fromEntries(
    agentTools
      .filter((tool) => tool.exposeToModel !== false)
      .map((tool) => [
        tool.declaration.name,
        defineAiTool({
          description: tool.declaration.description,
          inputSchema: jsonSchema((tool.declaration.parameters ?? {
            type: 'object',
            properties: {},
            additionalProperties: false,
          }) as JSONSchema7),
        }),
      ]),
  )
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
  toolCallId: string
  name: string
  args: Record<string, unknown>
}

function getExecutableFunctionCalls(
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

function getLoopFailureReply(error: unknown): string {
  if (error instanceof ModelCallTimeoutError || isRetryableModelError(error)) {
    return 'Сервис ответа сейчас перегружен. Попробуй ещё раз чуть позже.'
  }
  return 'Что-то пошло не так 😵'
}

// ── Content building ─────────────────────────────────────────

type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: Buffer; mediaType: string }

function pushImageContent(
  parts: UserContentPart[],
  label: string,
  media: MediaBuffer,
) {
  parts.push({ type: 'text', text: label })
  parts.push({
    type: 'image',
    image: media.buffer,
    mediaType: media.mimeType,
  })
}

function buildInitialInput(
  message: Message,
  textContent: string,
  mediaBuffers: MediaBuffer[] | undefined,
  historyMediaAttachments: HistoryMediaAttachment[],
): ModelMessage[] {
  const parts: UserContentPart[] = []

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

    parts.push({
      type: 'text',
      text: `${replyLabel}: ${replyText || '[media]'}`,
    })
  }

  for (const { media, message: srcMsg } of historyMediaAttachments) {
    pushImageContent(parts, getHistoryMediaPrompt(srcMsg), media)
  }

  parts.push({
    type: 'text',
    text: textContent || '[User sent media without text]',
  })

  return [{ role: 'user', content: parts }]
}

// ── Model loop ───────────────────────────────────────────────

function buildFunctionResponsePart(
  call: ExecutableFunctionCall,
  output: string,
) {
  return {
    type: 'tool-result' as const,
    toolCallId: call.toolCallId,
    toolName: call.name,
    output: { type: 'text' as const, value: output },
  }
}

function getAgentProviderOptions(
  chatId: number,
): Record<string, Record<string, JSONValue>> {
  if (CHAT_MODEL_CONFIG.provider === 'google') {
    return { google: { serviceTier: 'priority' } }
  }

  return {
    openai: {
      reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
      safetyIdentifier: String(chatId),
      store: false,
    },
  }
}

async function runToolLoop(
  input: ModelMessage[],
  systemInstruction: string,
  tools: ToolSet,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<{ finalText: string; toolResults: string[] }> {
  let finalText = ''
  const toolResults: string[] = []

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await generateModelWithRetry(
      {
        messages: input,
        system: systemInstruction,
        tools: Object.keys(tools).length ? tools : undefined,
        toolChoice: 'auto',
        providerOptions: getAgentProviderOptions(chatId),
      },
      chatId,
      iteration === 0 ? 'routing' : `iteration_${iteration}`,
      CHAT_MODEL_CONFIG,
    )

    const responseMessages = response.response.messages as ModelMessage[]
    const functionCalls = getExecutableFunctionCalls(response.toolCalls)
    logger.info(
      {
        chatId,
        model: CHAT_MODEL_LABEL,
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

    input.push(...responseMessages)

    const executionResults = await executeToolCalls(
      callsToExecute,
      toolByName,
      chatId,
    )
    toolResults.push(...executionResults.map((tr) => tr.result))

    const functionResponses = [
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
          model: CHAT_MODEL_LABEL,
          tools: callsToExecute.map((fc) => fc.name),
        },
        'loop.terminal_tools_skip',
      )
      break
    }

    input.push({ role: 'tool', content: functionResponses })
  }

  // If no text came out of the loop, force a final synthesis pass without tools.
  if (!finalText.trim()) {
    try {
      const finalizeResponse = await generateModelWithRetry(
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
          providerOptions: getAgentProviderOptions(chatId),
        },
        chatId,
        'finalize',
        CHAT_MODEL_CONFIG,
      )
      const finalizeText = finalizeResponse.text.trim()
      if (finalizeText) {
        finalText = finalizeText
      } else {
        logger.warn({ chatId, model: CHAT_MODEL_LABEL }, 'loop.finalize_empty')
      }
    } catch (error) {
      logger.warn(
        { chatId, model: CHAT_MODEL_LABEL, error: extractErrorInfo(error) },
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
            text: cleanModelMessage(
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

      const historyMediaBuffers = historyMediaAttachments.map(
        ({ media, message: sourceMessage }) => ({
          ...media,
          label: getHistoryMediaPrompt(sourceMessage),
        }),
      )
      const allMediaBuffers = [...(mediaBuffers ?? []), ...historyMediaBuffers]
      setToolMediaBuffers(allMediaBuffers)

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
          model: CHAT_MODEL_LABEL,
          reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
          exposedTools: Object.keys(tools),
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

      const { finalText } = await runToolLoop(
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
        allTextParts.push(cleanModelMessage(finalText))
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
