import type { Message } from 'telegram-typings'

import {
  type BotIdentity,
  getChatMemory,
  getGlobalMemory,
} from '@tg-bot/common'
import { getMessageLogMeta, logger } from '../logger'
import {
  getAgentTools,
  getCollectedResponses,
  runWithToolContext,
  TOOL_NAMES,
} from '../tools'
import type { AgentResponse, TelegramApi } from '../types'
import { buildContextBlock, buildMemoryBlock, splitResponses } from './context'
import { sendResponses } from './delivery'
import { composeFinalText } from './final-text'
import { shouldRespondAfterRecheck } from './reply-gate'
import { buildCollectionMessages, runToolCollection } from './tool-collection'
import { startTyping } from './typing'

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
      const shouldRespond = await shouldRespondAfterRecheck({
        message,
        textContent,
        hasImages,
        memoryBlock,
        botInfo,
      })
      if (!shouldRespond) {
        logger.info(
          {
            ...messageMeta,
            reason: 'final_reply_gate',
          },
          'loop.skipped',
        )
        return
      }

      // Set reaction only after reply-gate confirms we will respond
      void api
        .setMessageReaction?.(chatId, message.message_id, [
          { type: 'emoji', emoji: '👀' },
        ])
        .catch(() => undefined)

      stopTyping = startTyping(api, chatId)

      const tools = await getAgentTools(chatId).catch((error) => {
        logger.error({ chatId, error }, 'tools.load_failed')
        return []
      })

      const contextBlock = buildContextBlock(message, textContent, hasImages)

      const collectionMessages = buildCollectionMessages({
        contextBlock,
        memoryBlock,
        textContent,
      })

      const { toolNotes, shouldSkip } = await runToolCollection({
        messages: collectionMessages,
        tools,
        chatId,
      })

      if (shouldSkip) {
        logger.info(
          {
            ...messageMeta,
            reason: TOOL_NAMES.DO_NOTHING,
          },
          'loop.skipped',
        )
        return
      }

      const { textDrafts, mediaResponses } = splitResponses(
        getCollectedResponses(),
      )

      const composeStartedAt = Date.now()
      const finalText = await composeFinalText({
        contextBlock,
        memoryBlock,
        textContent,
        toolNotes,
        textDrafts,
        hasMedia: mediaResponses.length > 0,
      })
      const composeDurationMs = Date.now() - composeStartedAt

      const responsesToSend: AgentResponse[] = [...mediaResponses]
      if (finalText.trim()) {
        responsesToSend.push({ type: 'text', text: finalText })
      }

      if (responsesToSend.length === 0) {
        logger.info(
          {
            ...messageMeta,
            composeDurationMs,
            durationMs: Date.now() - startedAt,
          },
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
          composeDurationMs,
          deliveryDurationMs: Date.now() - deliveryStartedAt,
          responseCount: responsesToSend.length,
          mediaCount: mediaResponses.length,
          hasFinalText: Boolean(finalText.trim()),
        },
        'loop.done',
      )
    })
  } catch (error) {
    logger.error(
      {
        ...messageMeta,
        durationMs: Date.now() - startedAt,
        error,
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
