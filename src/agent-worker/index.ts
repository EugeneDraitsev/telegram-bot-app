import type { Handler } from 'aws-lambda'
import type { Message } from 'telegram-typings'

import {
  type BotIdentity,
  createBot,
  getImageBuffers,
  isAgenticChatEnabled,
} from '@tg-bot/common'
import { runAgenticLoop } from './agent'
import { getMessageLogMeta, logger } from './logger'

const bot = createBot()

export interface AgentWorkerPayload {
  message: Message
  imagesData?: string[] // base64 encoded images
  imageFileIds?: string[]
  botInfo?: BotIdentity
}

const TELEGRAM_FILE_BASE_URL = 'https://api.telegram.org/file/bot'
let cachedBotInfo: BotIdentity | undefined

async function resolveBotInfo(
  incomingBotInfo?: BotIdentity,
): Promise<BotIdentity | undefined> {
  if (incomingBotInfo?.id) {
    cachedBotInfo = incomingBotInfo
    return incomingBotInfo
  }

  if (cachedBotInfo?.id) {
    return cachedBotInfo
  }

  try {
    const me = await bot.api.getMe()
    cachedBotInfo = { id: me.id, username: me.username }
    return cachedBotInfo
  } catch (error) {
    logger.warn({ error }, 'worker.bot_info_unavailable')
    return incomingBotInfo
  }
}

async function fetchImagesByFileIds(fileIds?: string[]): Promise<Buffer[]> {
  const uniqueIds = [...new Set((fileIds ?? []).filter(Boolean))]
  if (uniqueIds.length === 0) return []

  const token = process.env.TOKEN
  if (!token) {
    logger.warn('TOKEN is not configured, cannot fetch images')
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

const agentWorker: Handler<AgentWorkerPayload> = async (event) => {
  const startedAt = Date.now()
  try {
    const { message, imagesData, imageFileIds, botInfo } = event

    if (!message?.chat?.id) {
      logger.error(
        {
          reason: 'missing_message_chat_id',
        },
        'worker.invalid_payload',
      )
      return { statusCode: 200, body: 'Invalid payload' }
    }

    const messageMeta = getMessageLogMeta(message)
    if (!(await isAgenticChatEnabled(message.chat.id))) {
      logger.info(
        {
          ...messageMeta,
          reason: 'chat_not_enabled',
        },
        'worker.skipped',
      )
      return { statusCode: 200, body: 'Skipped' }
    }

    logger.info(
      {
        ...messageMeta,
        hasInlineImages: Boolean(imagesData?.length),
        imageFileIdsCount: imageFileIds?.length ?? 0,
      },
      'worker.start',
    )

    const effectiveBotInfo = await resolveBotInfo(botInfo)
    const decodedImages = imagesData?.map((base64) =>
      Buffer.from(base64, 'base64'),
    )
    // Decode images if present in payload, otherwise fetch by Telegram file ids.
    const fetchedImages = decodedImages?.length
      ? decodedImages
      : await fetchImagesByFileIds(imageFileIds)
    const effectiveImages = fetchedImages.length > 0 ? fetchedImages : undefined

    // Run the agentic loop with bot API
    await runAgenticLoop(message, bot.api, effectiveImages, effectiveBotInfo)
    logger.info(
      {
        ...messageMeta,
        durationMs: Date.now() - startedAt,
        imageCount: effectiveImages?.length ?? 0,
      },
      'worker.done',
    )

    return { statusCode: 200, body: 'OK' }
  } catch (error) {
    logger.error(
      {
        durationMs: Date.now() - startedAt,
        error,
      },
      'worker.failed',
    )
    return { statusCode: 200, body: 'Error' }
  }
}

export default agentWorker
