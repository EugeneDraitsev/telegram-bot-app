import { ThinkingLevel } from '@google/genai'
import type {
  Content,
  FunctionCall,
  GenerateContentResponse,
  Part,
  Tool,
} from '@google/genai'
import type { Message } from 'telegram-typings'

import {
  type BotIdentity,
  cleanGeminiMessage,
  getChatMemory,
  getGlobalMemory,
} from '@tg-bot/common'
import { getMessageLogMeta, logger } from '../logger'
import {
  getAgentTools,
  getCollectedResponses,
  runWithToolContext,
} from '../tools'
import type { AgentResponse, AgentTool, TelegramApi } from '../types'
import {
  MAX_RETRIES,
  MAX_TOOL_ITERATIONS,
  RETRY_BASE_DELAY_MS,
  TERMINAL_TOOLS,
  TOOL_CALL_TIMEOUT_MS,
} from './config'
import { buildContextBlock, buildMemoryBlock, splitResponses } from './context'
import { sendResponses } from './delivery'
import { ai, CHAT_MODEL } from './models'
import { shouldEngageWithMessage } from './reply-gate'
import { agentSystemInstructions } from './system-instructions'
import { startTyping } from './typing'

// ── Helpers ──────────────────────────────────────────────────

function buildSystemInstruction(
  contextBlock: string,
  memoryBlock?: string,
): string {
  const parts = [agentSystemInstructions, contextBlock]
  if (memoryBlock) {
    parts.push(memoryBlock)
  }
  return parts.join('\n\n')
}

function buildNativeTools(agentTools: AgentTool[]): Tool[] {
  if (agentTools.length === 0) {
    return []
  }
  return [{ functionDeclarations: agentTools.map((t) => t.declaration) }]
}

/**
 * Call generateContent with retry logic for transient errors (503, 429).
 */
async function generateWithRetry(
  params: Parameters<typeof ai.models.generateContent>[0],
  chatId: number,
): Promise<GenerateContentResponse> {
  let lastError: unknown

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await ai.models.generateContent(params)
    } catch (error) {
      lastError = error
      const status = (error as { status?: number })?.status
      const isRetryable = status === 503 || status === 429

      if (!isRetryable || attempt === MAX_RETRIES) {
        throw error
      }

      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt
      logger.warn(
        { chatId, attempt: attempt + 1, status, delayMs: delay },
        'model.retry',
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

async function executeToolCall(
  toolCall: FunctionCall,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<{ name: string; result: string }> {
  const name = toolCall.name ?? ''
  const tool = toolByName.get(name)
  if (!tool) {
    return { name, result: `Error: tool "${name}" not found` }
  }

  logger.info({ chatId, tool: name, payload: toolCall.args }, 'tool.call')

  try {
    const result = await Promise.race([
      tool.execute((toolCall.args as Record<string, unknown>) ?? {}),
      new Promise<string>((_, reject) => {
        const handle = setTimeout(
          () =>
            reject(new Error(`Tool timed out after ${TOOL_CALL_TIMEOUT_MS}ms`)),
          TOOL_CALL_TIMEOUT_MS,
        )
        // biome-ignore lint/suspicious/noExplicitAny: timer unref
        ;(handle as any).unref?.()
      }),
    ])

    logger.info({ chatId, tool: name, result }, 'tool.done')
    return { name, result }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    logger.error({ chatId, tool: name, error: errorMsg }, 'tool.failed')
    return { name, result: `Error: ${errorMsg}` }
  }
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

// ── Main loop ────────────────────────────────────────────────

export async function runAgenticLoop(
  message: Message,
  api: TelegramApi,
  imagesData?: Buffer[],
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
    await runWithToolContext(message, imagesData, async () => {
      const textContent = message.text || message.caption || ''
      const hasImages = !!imagesData?.length || !!message.photo?.length

      const [chatMemory, globalMemory] = await Promise.all([
        getChatMemory(chatId).catch(() => ''),
        getGlobalMemory().catch(() => ''),
      ])
      const memoryBlock = buildMemoryBlock(chatMemory, globalMemory)

      const shouldRespond = await shouldEngageWithMessage({
        message,
        textContent,
        hasImages,
        memoryBlock,
        botInfo,
      })
      if (!shouldRespond) {
        logger.info({ ...messageMeta, reason: 'reply_gate' }, 'loop.skipped')
        return
      }

      // Set reaction only after reply-gate confirms we will respond
      void api
        .setMessageReaction?.(chatId, message.message_id, [
          { type: 'emoji', emoji: '👀' },
        ])
        .catch(() => undefined)

      stopTyping = startTyping(api, chatId)

      const agentTools = await getAgentTools(chatId).catch((error) => {
        logger.error({ chatId, error }, 'tools.load_failed')
        return [] as AgentTool[]
      })

      const contextBlock = buildContextBlock(message, textContent, hasImages)
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

      // Build initial contents
      const contents: Content[] = [
        {
          role: 'user',
          parts: [{ text: textContent || '[User sent media without text]' }],
        },
      ]

      // generateContent loop with native function calling
      let finalText = ''

      for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
        const response = await generateWithRetry(
          {
            model: CHAT_MODEL,
            contents,
            config: {
              systemInstruction,
              tools,
              temperature: 1.0,
              thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
            },
          },
          chatId,
        )

        const parts = response.candidates?.[0]?.content?.parts ?? []
        const functionCalls = parts.filter(
          (p): p is Part & { functionCall: FunctionCall } => !!p.functionCall,
        )
        const textParts = parts.filter((p) => p.text).map((p) => p.text ?? '')

        if (textParts.length > 0) {
          finalText = textParts.join('\n')
        }

        // No function calls → we're done
        if (functionCalls.length === 0) {
          break
        }

        // Add model response to context
        contents.push({ role: 'model', parts })

        // Execute all function calls
        const toolResults = await Promise.all(
          functionCalls.map((fc) =>
            executeToolCall(fc.functionCall, toolByName, chatId),
          ),
        )

        // Check if ALL called tools are terminal (produce complete responses)
        // If so, skip the second model call — the tool response IS the response
        const allTerminal = functionCalls.every((fc) =>
          TERMINAL_TOOLS.has(fc.functionCall.name ?? ''),
        )
        const collectedNow = getCollectedResponses()

        if (allTerminal && collectedNow.length > 0) {
          logger.info(
            { chatId, tools: functionCalls.map((fc) => fc.functionCall.name) },
            'loop.terminal_tools_skip',
          )
          break
        }

        // Add tool results back as function responses
        contents.push({
          role: 'user',
          parts: toolResults.map((tr) => ({
            functionResponse: {
              name: tr.name,
              response: { result: tr.result },
            },
          })),
        })
      }

      // Collect any responses added by tools (media, text drafts, etc.)
      const { textDrafts, mediaResponses } = splitResponses(
        getCollectedResponses(),
      )

      // Build final list of responses
      const responsesToSend: AgentResponse[] = [...mediaResponses]

      // Combine model's final text with any tool text drafts
      const allTextParts: string[] = []
      if (textDrafts.length > 0) {
        allTextParts.push(...textDrafts)
      }
      if (finalText.trim()) {
        allTextParts.push(cleanGeminiMessage(finalText))
      }

      const combinedText = allTextParts.join('\n\n').trim()
      if (combinedText) {
        responsesToSend.push({ type: 'text', text: combinedText })
      }

      if (responsesToSend.length === 0) {
        logger.info(
          { ...messageMeta, durationMs: Date.now() - startedAt },
          'loop.no_response',
        )
        return
      }

      const deliveryStartedAt = Date.now()
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
          deliveryDurationMs: Date.now() - deliveryStartedAt,
          responseCount: responsesToSend.length,
          mediaCount: mediaResponses.length,
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
      await api.sendMessage(chatId, 'Что-то пошло не так 😵', {
        reply_parameters: { message_id: message.message_id },
      })
    } catch (sendError) {
      logger.error({ chatId, sendError }, 'loop.error_reply_failed')
    }
  } finally {
    stopTyping?.()
  }
}
