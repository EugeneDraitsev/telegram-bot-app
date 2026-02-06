/**
 * Agent Worker Lambda
 *
 * Handles async agent processing after quick filter passes.
 * Called from main handler via invokeAgentLambda pattern.
 *
 * New architecture:
 * - Tools are "pure" - they collect responses, don't send directly
 * - After agentic loop, all responses are sent together
 * - Independent from @tg-bot/common (uses own services)
 */

import type { LambdaFunctionURLHandler } from 'aws-lambda'
import type { Message } from 'telegram-typings'

import {
  createBot,
  getImageBuffers,
  saveBotMessageMiddleware,
} from '@tg-bot/common'
import { runAgenticLoop } from './agent'
import { clearToolContext } from './tools'

// Minimal bot instance for sending messages
const bot = createBot()
bot.use(saveBotMessageMiddleware)

export interface AgentWorkerPayload {
  message: Message
  imagesData?: string[] // base64 encoded images
  imageFileIds?: string[]
}

const TELEGRAM_FILE_BASE_URL = 'https://api.telegram.org/file/bot'

async function fetchImagesByFileIds(fileIds?: string[]): Promise<Buffer[]> {
  const uniqueIds = [...new Set((fileIds ?? []).filter(Boolean))]
  if (uniqueIds.length === 0) return []

  const token = process.env.TOKEN
  if (!token) {
    console.warn('[AgentWorker] TOKEN is not configured, cannot fetch images')
    return []
  }

  const fileResults = await Promise.allSettled(
    uniqueIds.map((fileId) => bot.api.getFile(fileId)),
  )

  const filePaths: string[] = []
  for (const result of fileResults) {
    if (result.status === 'fulfilled' && result.value.file_path) {
      filePaths.push(result.value.file_path)
    }
  }

  const urls = filePaths.map(
    (filePath) => `${TELEGRAM_FILE_BASE_URL}${token}/${filePath}`,
  )

  if (urls.length === 0) return []

  return getImageBuffers(urls)
}

const agentWorker: LambdaFunctionURLHandler = async (event) => {
  try {
    const payload = event as unknown as AgentWorkerPayload
    const { message, imagesData, imageFileIds } = payload

    if (!message?.chat?.id) {
      console.error('[AgentWorker] Invalid payload - no message or chat id')
      return { statusCode: 200, body: 'Invalid payload' }
    }

    // Decode images if present in payload, otherwise fetch by Telegram file ids.
    const decodedImages = imagesData?.map((base64) =>
      Buffer.from(base64, 'base64'),
    )
    const fetchedImages = decodedImages?.length
      ? decodedImages
      : await fetchImagesByFileIds(imageFileIds)
    const effectiveImages = fetchedImages.length > 0 ? fetchedImages : undefined

    // Run the agentic loop with bot API
    await runAgenticLoop(message, bot.api, effectiveImages)

    return { statusCode: 200, body: 'OK' }
  } catch (error) {
    console.error('[AgentWorker] Error:', error)
    return { statusCode: 200, body: 'Error' }
  } finally {
    clearToolContext()
  }
}

export default agentWorker
