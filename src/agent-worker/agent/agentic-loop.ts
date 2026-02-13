import type { Message } from 'telegram-typings'

import { getChatMemory, getGlobalMemory } from '@tg-bot/common'
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
import { buildCollectionMessages, runToolCollection } from './tool-collection'
import { startTyping } from './typing'

export async function runAgenticLoop(
  message: Message,
  api: TelegramApi,
  imagesData?: Buffer[],
): Promise<void> {
  const startedAt = Date.now()
  const chatId = message.chat?.id
  if (!chatId) {
    logger.error({ reason: 'missing_chat_id' }, 'loop.invalid_input')
    return
  }

  const messageMeta = getMessageLogMeta(message)
  logger.info(messageMeta, 'loop.start')

  const stopTyping = startTyping(api, chatId)

  try {
    await runWithToolContext(message, imagesData, async () => {
      const tools = await getAgentTools(chatId).catch((error) => {
        logger.error({ chatId, error }, 'tools.load_failed')
        return []
      })

      const textContent = message.text || message.caption || ''
      const hasImages = !!imagesData?.length || !!message.photo?.length
      const contextBlock = buildContextBlock(message, textContent, hasImages)

      const [chatMemory, globalMemory] = await Promise.all([
        getChatMemory(chatId).catch(() => ''),
        getGlobalMemory().catch(() => ''),
      ])
      const memoryBlock = buildMemoryBlock(chatMemory, globalMemory)

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
  } finally {
    stopTyping()
  }
}
