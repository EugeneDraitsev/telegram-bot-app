import type { Handler } from 'aws-lambda'
import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import {
  type BotIdentity,
  createBot,
  getMediaGroupMessages,
  getMultimodalCommandData,
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

    const ctx = {
      message,
      chat: message.chat,
      api: bot.api,
    } as unknown as Context
    const extraMessages = await getMediaGroupMessages(ctx)
    const commandData = await getMultimodalCommandData(ctx, extraMessages)
    const images = commandData.imagesData

    // Run the agentic loop with bot API
    await runAgenticLoop(message, bot.api, images, effectiveBotInfo)
    logger.info(
      {
        ...messageMeta,
        durationMs: Date.now() - startedAt,
        imageCount: images.length,
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
