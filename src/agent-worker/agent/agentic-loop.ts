// import { ThinkingLevel } from '@google/genai'
import type { Content, FunctionCall, Part, Tool } from '@google/genai'
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
import {
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
  generateWithRetry,
  isRetryableModelError,
  ModelCallTimeoutError,
} from './model-call'
import {
  CHAT_MODEL,
  CHAT_MODEL_FALLBACK,
  FAST_MODEL,
  SEARCH_MODEL_PRIMARY,
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
  if (agentTools.length === 0) return []
  return [
    {
      functionDeclarations: agentTools.map((t) => {
        // Strip 'type' field — generateContent API doesn't accept it
        // (it was added for Interactions API compatibility)
        const { type: _, ...declaration } = t.declaration as unknown as Record<
          string,
          unknown
        >
        return declaration
        // biome-ignore lint/suspicious/noExplicitAny: structurally compatible at runtime
      }) as any,
    },
  ]
}

/** Maps tool names to their underlying AI model for metrics */
const TOOL_MODELS: Record<string, string> = {
  generate_or_edit_image: IMAGE_MODEL,
  generate_voice: VOICE_MODEL,
  web_search: SEARCH_MODEL_PRIMARY,
  search_video: SEARCH_MODEL_PRIMARY,
  code_execution: FAST_MODEL,
  url_context: FAST_MODEL,
}
const RATE_LIMITED_TOOLS = new Set(['web_search', 'search_video'])

const MAX_HISTORY_IMAGE_ATTACHMENTS = 4

function getHistoryMediaPrompt(message: Message): string {
  const sourceText = (message.caption || message.text || '').trim()
  return sourceText
    ? `Context image from recent chat history. Related message text: ${sourceText.slice(0, 200)}`
    : 'Context image from recent chat history.'
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

async function executeToolCall(
  toolCall: FunctionCall,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<{ name: string; result: string }> {
  const name = toolCall.name ?? ''
  const tool = toolByName.get(name)
  if (!tool) return { name, result: `Error: tool "${name}" not found` }

  logger.info({ chatId, tool: name, payload: toolCall.args }, 'tool.call')

  const toolStart = Date.now()
  try {
    const timeout = tool.timeoutMs ?? TOOL_CALL_TIMEOUT_MS
    const result = await withTimeout(
      tool.execute((toolCall.args as Record<string, unknown>) ?? {}),
      timeout,
      `Tool timed out after ${timeout}ms`,
    )

    const durationMs = Date.now() - toolStart
    const status = getToolResultStatus(result)
    if (status === 'success') {
      logger.info({ chatId, tool: name, durationMs, result }, 'tool.done')
    } else {
      logger.warn(
        { chatId, tool: name, durationMs, result, status },
        'tool.done_non_success',
      )
    }
    void recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name,
      model: TOOL_MODELS[name],
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
      { chatId, tool: name, durationMs, error: errorMsg, status },
      'tool.failed',
    )
    void recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name,
      model: TOOL_MODELS[name],
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
  calls: Array<Part & { functionCall: FunctionCall }>,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<Array<{ call: FunctionCall; name: string; result: string }>> {
  const run = (call: Part & { functionCall: FunctionCall }) =>
    executeToolCall(call.functionCall, toolByName, chatId).then((r) => ({
      call: call.functionCall,
      ...r,
    }))

  // Run sequentially when search-backed tools are present (rate limiting).
  if (calls.some((c) => RATE_LIMITED_TOOLS.has(c.functionCall.name ?? ''))) {
    const results: Array<{ call: FunctionCall; name: string; result: string }> =
      []
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

function extractFallbackTextFromToolResults(
  contents: Content[],
): string | null {
  const results: string[] = []
  for (let i = contents.length - 1; i >= 0; i--) {
    for (const part of [...(contents[i]?.parts ?? [])].reverse()) {
      const rawResult = (
        part as unknown as {
          functionResponse?: { response?: { result?: unknown } }
        }
      ).functionResponse?.response?.result
      if (
        typeof rawResult === 'string' &&
        rawResult.trim() &&
        !rawResult.startsWith('Error:')
      ) {
        results.push(rawResult.trim())
      }
    }
  }
  return results.length ? [...new Set(results)].slice(0, 2).join('\n\n') : null
}

function getLoopFailureReply(error: unknown): string {
  if (error instanceof ModelCallTimeoutError || isRetryableModelError(error)) {
    return 'Сервис ответа сейчас перегружен. Попробуй ещё раз чуть позже.'
  }
  return 'Что-то пошло не так 😵'
}

// ── Content building ─────────────────────────────────────────

function buildInitialContents(
  _message: Message,
  textContent: string,
  mediaBuffers: MediaBuffer[] | undefined,
  historyMediaAttachments: HistoryMediaAttachment[],
): Content[] {
  const historyParts: Content[] = historyMediaAttachments.map(
    ({ media, message: srcMsg }) => ({
      role: 'user',
      parts: [
        { text: getHistoryMediaPrompt(srcMsg) },
        {
          inlineData: {
            mimeType: media.mimeType,
            data: media.buffer.toString('base64'),
          },
        } as Part,
      ],
    }),
  )

  const mediaParts: Content[] = (mediaBuffers ?? []).map((m) => ({
    role: 'user',
    parts: [
      {
        inlineData: { mimeType: m.mimeType, data: m.buffer.toString('base64') },
      } as Part,
    ],
  }))

  return [
    ...historyParts,
    ...mediaParts,
    {
      role: 'user',
      parts: [{ text: textContent || '[User sent media without text]' }],
    },
  ]
}

// ── Model loop ───────────────────────────────────────────────

async function runToolLoop(
  contents: Content[],
  systemInstruction: string,
  tools: Tool[],
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<string> {
  let finalText = ''
  const followUpModel = CHAT_MODEL_FALLBACK

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const response = await generateWithRetry(
      {
        model: iteration === 0 ? CHAT_MODEL : followUpModel,
        contents,
        config: {
          systemInstruction,
          tools,
          temperature: iteration === 0 ? 1.0 : 0.2,
        },
      },
      chatId,
      iteration === 0 ? 'routing' : `iteration_${iteration}`,
    )

    const candidateContent = response.candidates?.[0]?.content
    const parts = candidateContent?.parts ?? []
    const functionCalls = parts.filter(
      (p): p is Part & { functionCall: FunctionCall } => !!p.functionCall,
    )
    const textParts = parts.filter((p) => p.text).map((p) => p.text ?? '')

    if (textParts.length > 0) finalText = textParts.join('\n')
    if (functionCalls.length === 0) break

    // If a round has both data-gathering and content-creating tools, defer
    // content tools so they run after data is available in the next iteration.
    const dataCalls = functionCalls.filter(
      (fc) => !CONTENT_TOOLS.has(fc.functionCall.name ?? ''),
    )
    const contentCalls = functionCalls.filter((fc) =>
      CONTENT_TOOLS.has(fc.functionCall.name ?? ''),
    )
    const hasDeferred = dataCalls.length > 0 && contentCalls.length > 0
    const callsToExecute = hasDeferred ? dataCalls : functionCalls

    if (hasDeferred) {
      logger.info(
        {
          chatId,
          iteration,
          deferred: contentCalls.map((fc) => fc.functionCall.name),
        },
        'loop.deferred_content_tools',
      )
    }

    contents.push(candidateContent ?? { role: 'model', parts })

    const executionResults = await executeToolCalls(
      callsToExecute,
      toolByName,
      chatId,
    )

    const functionResponses = [
      ...executionResults.map((tr) => ({
        functionResponse: { name: tr.name, response: { result: tr.result } },
      })),
      ...(hasDeferred
        ? contentCalls.map((fc) => ({
            functionResponse: {
              name: fc.functionCall.name ?? '',
              response: {
                result:
                  'NOT EXECUTED YET — data was just fetched. Call this tool again now with the actual data.',
              },
            },
          }))
        : []),
    ]

    const allTerminal = callsToExecute.every((fc) =>
      TERMINAL_TOOLS.has(fc.functionCall.name ?? ''),
    )
    if (allTerminal && getCollectedResponses().length > 0 && !hasDeferred) {
      logger.info(
        { chatId, tools: callsToExecute.map((fc) => fc.functionCall.name) },
        'loop.terminal_tools_skip',
      )
      break
    }

    contents.push({ role: 'user', parts: functionResponses })
  }

  // If no text came out of the loop, force a final synthesis pass without tools.
  if (!finalText.trim()) {
    try {
      const finalizeResponse = await generateWithRetry(
        {
          model: followUpModel,
          contents: [
            ...contents,
            {
              role: 'user',
              parts: [
                {
                  text: 'Provide the final user-facing answer now. Use plain text only and do not call tools. Use successful tool results as the primary evidence. If any tool failed or timed out, explicitly say you could not verify that part instead of guessing.',
                },
              ],
            },
          ],
          config: { systemInstruction, temperature: 0.2 },
        },
        chatId,
        'finalize',
      )
      const finalizeText = (
        finalizeResponse.candidates?.[0]?.content?.parts ?? []
      )
        .filter((p) => p.text)
        .map((p) => p.text ?? '')
        .join('\n')
        .trim()
      if (finalizeText) {
        finalText = finalizeText
      } else {
        logger.warn({ chatId }, 'loop.finalize_empty')
      }
    } catch (error) {
      logger.warn(
        { chatId, error: extractErrorInfo(error) },
        'loop.finalize_failed',
      )
    }
  }

  return finalText
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
  logger.info(messageMeta, 'loop.start')

  let stopTyping: (() => void) | undefined

  try {
    await runWithToolContext(message, mediaBuffers, async () => {
      const textContent = message.text || message.caption || ''
      const hasMedia =
        !!mediaBuffers?.length || collectMediaFileRefs(message).length > 0

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
        logger.info({ ...messageMeta, reason: 'reply_gate' }, 'loop.skipped')
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

      const historyImageRefs = collectHistoryMediaFileRefs(rawHistory, {
        excludeMessageId: message.message_id,
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
        ...historyMediaAttachments.map((e) => e.media),
        ...(mediaBuffers ?? []),
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
          .filter((t) => t.declaration.name != null)
          .map((t) => [t.declaration.name ?? '', t]),
      )

      const contents = buildInitialContents(
        message,
        textContent,
        mediaBuffers,
        historyMediaAttachments,
      )

      const finalText = await runToolLoop(
        contents,
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
        const fallback = extractFallbackTextFromToolResults(contents)
        if (fallback) {
          allTextParts.push(cleanGeminiMessage(fallback))
          logger.warn({ chatId }, 'loop.fallback_from_tool_result')
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
          { ...messageMeta, durationMs: Date.now() - startedAt },
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
