import type { Handler } from 'aws-lambda'
import type { Message } from 'telegram-typings'

import {
  type BotIdentity,
  createBot,
  getImageBuffers,
  getLargestPhoto,
  getMediaGroupMessagesFromHistory,
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

/**
 * Merge ingress-provided file IDs with any extra photos from media group albums.
 * This runs on the worker side to keep the ingress lambda fast.
 */
async function collectAllImageFileIds(
  message: Message,
  ingressFileIds?: string[],
): Promise<string[]> {
  const ids = [...(ingressFileIds ?? [])]

  // Look up extra album photos from history (async, hits Redis)
  const extraMessages = await getMediaGroupMessagesFromHistory(
    message.chat?.id || 0,
    message.message_id,
    message.media_group_id,
    message.reply_to_message?.media_group_id,
    true,
  )

  for (const msg of extraMessages) {
    const fileId = getLargestPhoto(msg)?.file_id
    if (fileId) ids.push(fileId)
  }

  const result = [...new Set(ids)]

  logger.info(
    {
      ingressCount: ingressFileIds?.length ?? 0,
      extraCount: extraMessages.length,
      totalUniqueIds: result.length,
      mediaGroupId: message.media_group_id,
      replyMediaGroupId: message.reply_to_message?.media_group_id,
    },
    'worker.collect_image_file_ids',
  )

  return result
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

    // Collect all image file IDs:
    // 1. IDs from ingress (direct message + reply photos)
    // 2. Extra IDs from media group albums (looked up from history on worker side)
    const allFileIds = await collectAllImageFileIds(message, imageFileIds)

    // Decode base64 images, fallback to fetching from Telegram
    const effectiveImages = imagesData?.length
      ? imagesData.map((b64) => Buffer.from(b64, 'base64'))
      : await fetchImagesByFileIds(allFileIds)

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
