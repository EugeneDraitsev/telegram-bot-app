import type { ModelMessage, UserModelMessage } from 'ai'
import type { Message } from 'grammy/types'

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
  getRecentRawHistory,
  isTelegramReplyTargetMissingError,
  logger,
  resolveHistoryMediaAttachments,
  startThinkingRichDraftIndicator,
  startTypingIndicator,
} from '@tg-bot/common'
import {
  executeDynamicCommandFromMessage,
  getAgentTools,
  getBaseAgentTools,
  getCollectedResponses,
  runWithToolContext,
  withToolMediaBuffers,
} from '../tools'
import type { AgentResponse, TelegramApi } from '../types'
import { buildContextBlock, buildMemoryBlock, splitResponses } from './context'
import { sendResponses } from './delivery'
import { isRetryableModelError, ModelCallTimeoutError } from './model-call'
import { buildModelToolRegistry } from './model-tools'
import { REPLY_GATE_MODEL, resolveAgentChatModel } from './models'
import { shouldEngageWithMessage } from './reply-gate'
import { extractErrorInfo } from './runtime'
import { agentSystemInstructions } from './system-instructions'
import { extractFallbackTextFromToolResults, runToolLoop } from './tool-loop'
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

const MAX_HISTORY_IMAGE_ATTACHMENTS = 4
const AGENT_PRELOAD_TIMEOUT_MS = 3_000

function getHistoryMediaPrompt(message: Message): string {
  const sourceText = (message.caption || message.text || '').trim()
  return sourceText
    ? `Context image from recent chat history. Related message text: ${sourceText.slice(0, 200)}`
    : 'Context image from recent chat history.'
}

async function preloadWithFallback<T>(params: {
  chatId: number
  name: string
  load: () => Promise<T>
  fallback: T
}): Promise<T> {
  const startedAt = Date.now()
  try {
    return await withTimeout(
      params.load(),
      AGENT_PRELOAD_TIMEOUT_MS,
      new Error(
        `${params.name} preload timed out after ${AGENT_PRELOAD_TIMEOUT_MS}ms`,
      ),
    )
  } catch (error) {
    logger.warn(
      {
        chatId: params.chatId,
        name: params.name,
        durationMs: Date.now() - startedAt,
        error: extractErrorInfo(error),
      },
      'loop.preload_failed',
    )
    return params.fallback
  }
}

function getLoopFailureReply(error: unknown): string {
  if (error instanceof ModelCallTimeoutError || isRetryableModelError(error)) {
    return 'Сервис ответа сейчас перегружен. Попробуй ещё раз чуть позже.'
  }
  return 'Что-то пошло не так 😵'
}

// ── Content building ─────────────────────────────────────────

function hasOwnTextContent(message: Message): boolean {
  return Boolean((message.text || message.caption || '').trim())
}

export function getAgentDeliveryReplyMessageId(
  message: Message,
  preferReplyTargetForEmptyText = false,
): number | undefined {
  const messageId = message.message_id
  const replyMessageId = message.reply_to_message?.message_id

  if (
    preferReplyTargetForEmptyText &&
    typeof replyMessageId === 'number' &&
    !hasOwnTextContent(message)
  ) {
    return replyMessageId
  }

  return typeof messageId === 'number' ? messageId : replyMessageId
}

type UserContentPart = Exclude<UserModelMessage['content'], string>[number]

function pushImageContent(
  parts: UserContentPart[],
  label: string,
  media: MediaBuffer,
) {
  parts.push({ type: 'text', text: label })
  parts.push({
    type: 'file',
    data: media.buffer,
    mediaType: media.mimeType,
  })
}

export function buildInitialInput(
  message: Message,
  textContent: string,
  mediaBuffers: MediaBuffer[] | undefined,
  historyMediaAttachments: HistoryMediaAttachment[],
): ModelMessage[] {
  const parts: UserContentPart[] = []

  for (const media of mediaBuffers ?? []) {
    const label = media.label || 'Request media'
    if (media.mediaType === 'image') {
      pushImageContent(parts, label, media)
    } else {
      parts.push({
        type: 'text',
        text: `${label}: attached ${media.mediaType} is available to media-generation tools.`,
      })
    }
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

/**
 * Runs a chat-defined dynamic command if the message matches one.
 * Returns false when no command matched and the normal flow should continue.
 */
async function runDynamicCommand(params: {
  message: Message
  chatId: number
  api: TelegramApi
  replyToMessageId?: number
  messageMeta: Record<string, unknown>
  startedAt: number
}): Promise<boolean> {
  const command = await executeDynamicCommandFromMessage(params.message)
  if (!command.matched) return false

  const responses: AgentResponse[] = [...getCollectedResponses()]
  if (!responses.some((response) => response.type === 'text')) {
    responses.push({
      type: 'text',
      text: cleanModelMessage(
        command.result || `Команда /${command.name} ничего не вернула.`,
      ),
    })
  }

  const deliveryStart = Date.now()
  await sendResponses({
    responses,
    chatId: params.chatId,
    replyToMessageId: params.replyToMessageId,
    api: params.api,
  })

  logger.info(
    {
      ...params.messageMeta,
      durationMs: Date.now() - params.startedAt,
      deliveryDurationMs: Date.now() - deliveryStart,
      commandName: command.name,
      responseCount: responses.length,
    },
    'loop.dynamic_command_done',
  )
  return true
}

/**
 * Sends a best-effort failure notice, retrying without the reply target when
 * the original message is gone.
 */
async function sendLoopFailureReply(
  api: TelegramApi,
  chatId: number,
  text: string,
  replyToMessageId?: number,
): Promise<void> {
  try {
    await api.sendMessage(
      chatId,
      text,
      replyToMessageId === undefined
        ? undefined
        : { reply_parameters: { message_id: replyToMessageId } },
    )
  } catch (error) {
    if (
      replyToMessageId === undefined ||
      !isTelegramReplyTargetMissingError(error)
    ) {
      throw error
    }

    logger.warn({ chatId, replyToMessageId }, 'loop.error_reply_target_missing')
    await api.sendMessage(chatId, text)
  }
}

// ── Main entry ───────────────────────────────────────────────

export async function runAgenticLoop(
  message: Message,
  api: TelegramApi,
  mediaBuffers?: MediaBuffer[],
  botInfo?: BotIdentity,
  options: { bypassReplyGate?: boolean; commandName?: string } = {},
): Promise<void> {
  const startedAt = Date.now()
  const chatId = message.chat?.id
  if (!chatId) {
    logger.error({ reason: 'missing_chat_id' }, 'loop.invalid_input')
    return
  }

  const chatModel = resolveAgentChatModel(options.commandName)
  const attribution = options.commandName
    ? { source: 'command' as const, command: options.commandName }
    : { source: 'agentic' as const }

  const messageMeta = getMessageLogMeta(message)
  const deliveryReplyMessageId = getAgentDeliveryReplyMessageId(
    message,
    Boolean(options.bypassReplyGate),
  )
  logger.info(
    {
      ...messageMeta,
      model: chatModel.label,
      reasoningEffort: chatModel.reasoningEffort,
      replyGateModel: REPLY_GATE_MODEL,
      ...attribution,
    },
    'loop.start',
  )

  let stopTyping: (() => void) | undefined
  let stopThinkingDraft: (() => void) | undefined
  const runInToolContext = <T>(callback: () => Promise<T>): Promise<T> =>
    runWithToolContext(
      message,
      mediaBuffers,
      callback,
      api,
      options.commandName,
    )

  try {
    await runInToolContext(async () => {
      const textContent = message.text || message.caption || ''
      const hasMedia =
        !!mediaBuffers?.length || collectMediaFileRefs(message).length > 0

      const handledByDynamicCommand = await runDynamicCommand({
        message,
        chatId,
        api,
        replyToMessageId: deliveryReplyMessageId,
        messageMeta,
        startedAt,
      })
      if (handledByDynamicCommand) return

      // Load memory first — needed by the reply gate
      const [chatMemory, globalMemory] = await Promise.all([
        preloadWithFallback({
          chatId,
          name: 'chat_memory',
          load: () => getChatMemory(chatId),
          fallback: '',
        }),
        preloadWithFallback({
          chatId,
          name: 'global_memory',
          load: getGlobalMemory,
          fallback: '',
        }),
      ])
      const memoryBlock = buildMemoryBlock(chatMemory, globalMemory)

      if (options.bypassReplyGate) {
        logger.info(
          { ...messageMeta, reason: 'explicit_command' },
          'loop.reply_gate_bypassed',
        )
      } else {
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
      }

      void api
        .setMessageReaction?.(chatId, message.message_id, [
          { type: 'emoji', emoji: AGENT_REACTION },
        ])
        .catch(() => undefined)

      stopThinkingDraft = startThinkingRichDraftIndicator({
        api,
        message,
        onError: (error) =>
          logger.warn({ chatId, error }, 'rich_thinking.failed'),
      })

      stopTyping = startTypingIndicator({
        chatId,
        sendChatAction: api.sendChatAction?.bind(api),
        onError: (error) => logger.warn({ chatId, error }, 'typing.failed'),
      })

      // Load tools + history in parallel (only after gate confirms we'll respond)
      const preloadStartedAt = Date.now()
      logger.info({ ...messageMeta }, 'loop.preload_start')
      const [agentTools, rawHistory] = await Promise.all([
        preloadWithFallback({
          chatId,
          name: 'agent_tools',
          load: () => getAgentTools(chatId),
          fallback: getBaseAgentTools(),
        }),
        preloadWithFallback({
          chatId,
          name: 'recent_history',
          load: () =>
            getRecentRawHistory(chatId, DEFAULT_AGENT_HISTORY_LIMIT + 1),
          fallback: [] as Message[],
        }),
      ])
      logger.info(
        {
          ...messageMeta,
          durationMs: Date.now() - preloadStartedAt,
          toolCount: agentTools.length,
          historyCount: rawHistory.length,
        },
        'loop.preload_done',
      )

      const recentHistory = getRecentHistoryContext(
        rawHistory,
        message.message_id,
      )
      const requestMediaIds = (key: 'fileId' | 'fileUniqueId') =>
        new Set(
          (mediaBuffers ?? [])
            .map((media) => media[key])
            .filter((id): id is string => Boolean(id)),
        )

      const historyImageRefs = collectHistoryMediaFileRefs(rawHistory, {
        excludeMessageId: message.message_id,
        excludeFileIds: requestMediaIds('fileId'),
        excludeFileUniqueIds: requestMediaIds('fileUniqueId'),
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
          origin: 'history' as const,
          label: getHistoryMediaPrompt(sourceMessage),
        }),
      )
      const allMediaBuffers = [...(mediaBuffers ?? []), ...historyMediaBuffers]
      await withToolMediaBuffers(allMediaBuffers, async () => {
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
        const { tools, toolByName } = buildModelToolRegistry(agentTools)
        logger.info(
          {
            chatId,
            model: chatModel.label,
            reasoningEffort: chatModel.reasoningEffort,
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

        const { finalText, toolResults } = await runToolLoop(
          input,
          systemInstruction,
          tools,
          toolByName,
          chatId,
          chatModel.config,
        )

        // Collect any responses produced by tools (media, text drafts, etc.)
        const { textDrafts, mediaResponses } = splitResponses(
          getCollectedResponses(),
        )
        const responsesToSend: AgentResponse[] = [...mediaResponses]

        const allTextParts: string[] = [...textDrafts]
        if (finalText.trim()) {
          allTextParts.push(cleanModelMessage(finalText))
        } else if (allTextParts.length === 0 && mediaResponses.length === 0) {
          const fallbackText = extractFallbackTextFromToolResults(toolResults)
          if (fallbackText) {
            allTextParts.push(fallbackText)
            logger.warn(
              {
                ...messageMeta,
                model: chatModel.label,
                toolResultCount: toolResults.length,
              },
              'loop.tool_result_fallback_text',
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
              model: chatModel.label,
              durationMs: Date.now() - startedAt,
            },
            'loop.no_response_fallback_text',
          )
        }

        const deliveryStart = Date.now()
        await sendResponses({
          responses: responsesToSend,
          chatId,
          replyToMessageId: deliveryReplyMessageId,
          api,
        })

        logger.info(
          {
            ...messageMeta,
            model: chatModel.label,
            reasoningEffort: chatModel.reasoningEffort,
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
    })
  } catch (error) {
    logger.error(
      {
        ...messageMeta,
        model: chatModel.label,
        reasoningEffort: chatModel.reasoningEffort,
        durationMs: Date.now() - startedAt,
        error: extractErrorInfo(error),
      },
      'loop.failed',
    )
    try {
      await sendLoopFailureReply(
        api,
        chatId,
        getLoopFailureReply(error),
        deliveryReplyMessageId,
      )
    } catch (sendError) {
      logger.error({ chatId, sendError }, 'loop.error_reply_failed')
    }
  } finally {
    stopThinkingDraft?.()
    stopTyping?.()
  }
}
