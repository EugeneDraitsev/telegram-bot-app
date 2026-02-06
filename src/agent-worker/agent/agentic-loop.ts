/**
 * Agentic loop for async worker:
 * 1) Collect data/media with tools
 * 2) Compose one final text answer
 * 3) Send merged response to Telegram
 */

import type { Message } from 'telegram-typings'

import { formatHistoryForContext, getRawHistory } from '../services'
import {
  clearToolContext,
  getAgentTools,
  getCollectedResponses,
  setToolContext,
} from '../tools'
import type { AgentChatMessage, AgentResponse, TelegramApi } from '../types'
import { buildContextBlock, splitResponses } from './context'
import { sendResponses } from './delivery'
import { composeFinalText } from './final-text'
import { buildCollectionMessages, runToolCollection } from './tool-collection'
import { startTyping } from './typing'

export async function runAgenticLoop(
  message: Message,
  api: TelegramApi,
  imagesData?: Buffer[],
): Promise<void> {
  const chatId = message.chat?.id
  if (!chatId) {
    console.error('[Agent] No chat ID')
    return
  }

  const stopTyping = startTyping(api, chatId)
  setToolContext(message, imagesData)

  try {
    const [rawHistory, tools] = await Promise.all([
      getRawHistory(chatId).catch(() => []),
      getAgentTools(chatId).catch((error) => {
        console.error('[Agent] Failed to load tools:', error)
        return []
      }),
    ])
    const historyContext = formatHistoryForContext(
      rawHistory,
    ) as AgentChatMessage[]

    const textContent = message.text || message.caption || ''
    const hasImages = !!imagesData?.length || !!message.photo?.length
    const contextBlock = buildContextBlock(message, textContent, hasImages)
    const collectionMessages = buildCollectionMessages({
      historyContext,
      contextBlock,
      textContent,
    })

    const { toolNotes, shouldSkip } = await runToolCollection({
      messages: collectionMessages,
      tools,
    })

    if (shouldSkip) {
      return
    }

    const { textDrafts, mediaResponses } = splitResponses(
      getCollectedResponses(),
    )
    const finalText = await composeFinalText({
      historyContext,
      contextBlock,
      textContent,
      toolNotes,
      textDrafts,
      hasMedia: mediaResponses.length > 0,
    })

    const responsesToSend: AgentResponse[] = [...mediaResponses]
    if (finalText.trim()) {
      responsesToSend.push({ type: 'text', text: finalText })
    }

    if (responsesToSend.length === 0) {
      return
    }

    await sendResponses({
      responses: responsesToSend,
      chatId,
      replyToMessageId: message.message_id,
      api,
    })
  } catch (error) {
    console.error('[Agent] Loop error:', error)
  } finally {
    stopTyping()
    clearToolContext()
  }
}
