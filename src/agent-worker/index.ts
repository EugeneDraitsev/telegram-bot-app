import type { Handler } from 'aws-lambda'
import type { Message } from 'grammy/types'
import type { Context } from 'grammy/web'

import {
  type BotIdentity,
  createBot,
  getMediaGroupMessages,
  getMessageLogMeta,
  getMultimodalMediaData,
  isAgenticChatEnabled,
  logger,
} from '@tg-bot/common'
import {
  CHAT_MODEL_LABEL,
  CHAT_MODEL_REASONING_EFFORT,
  REPLY_GATE_MODEL,
  runAgenticLoop,
} from './agent'
import {
  AGENT_WORKER_HEARTBEAT_INTERVAL_MS,
  type AgentWorkerLease,
  acquireAgentWorkerLease,
} from './idempotency'

const bot = createBot()

export interface AgentWorkerPayload {
  message: Message
  imagesData?: string[] // base64 encoded images
  imageFileIds?: string[]
  botInfo?: BotIdentity
  bypassReplyGate?: boolean
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

function startLeaseHeartbeat(
  lease: AgentWorkerLease,
  messageMeta: ReturnType<typeof getMessageLogMeta>,
): ReturnType<typeof setInterval> {
  const heartbeat = setInterval(() => {
    void lease
      .renew()
      .then((renewed) => {
        if (!renewed) {
          logger.warn(messageMeta, 'worker.idempotency_lease_lost')
        }
      })
      .catch((error) =>
        logger.warn({ ...messageMeta, error }, 'worker.heartbeat_failed'),
      )
  }, AGENT_WORKER_HEARTBEAT_INTERVAL_MS)
  heartbeat.unref()
  return heartbeat
}

const agentWorker: Handler<AgentWorkerPayload> = async (event, context) => {
  const startedAt = Date.now()
  let lease: AgentWorkerLease | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  try {
    const { message, imagesData, imageFileIds, botInfo, bypassReplyGate } =
      event

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

    lease =
      (await acquireAgentWorkerLease(
        message.chat.id,
        message.message_id,
        context.awsRequestId,
      )) ?? undefined
    if (!lease) {
      logger.info(messageMeta, 'worker.duplicate_skipped')
      return { statusCode: 200, body: 'Duplicate' }
    }
    heartbeat = startLeaseHeartbeat(lease, messageMeta)

    logger.info(
      {
        ...messageMeta,
        model: CHAT_MODEL_LABEL,
        reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
        replyGateModel: REPLY_GATE_MODEL,
        hasInlineImages: Boolean(imagesData?.length),
        imageFileIdsCount: imageFileIds?.length ?? 0,
        bypassReplyGate: Boolean(bypassReplyGate),
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
    const mediaData = await getMultimodalMediaData(ctx, extraMessages)

    // Run the agentic loop with bot API
    await runAgenticLoop(
      message,
      bot.api,
      mediaData.mediaBuffers,
      effectiveBotInfo,
      { bypassReplyGate },
    )
    logger.info(
      {
        ...messageMeta,
        model: CHAT_MODEL_LABEL,
        reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
        replyGateModel: REPLY_GATE_MODEL,
        durationMs: Date.now() - startedAt,
        mediaCount: mediaData.mediaBuffers.length,
        bypassReplyGate: Boolean(bypassReplyGate),
      },
      'worker.done',
    )

    try {
      if (!(await lease.complete())) {
        logger.warn(messageMeta, 'worker.idempotency_completion_failed')
      }
    } catch (completionError) {
      logger.warn(
        { ...messageMeta, error: completionError },
        'worker.idempotency_completion_failed',
      )
    }

    return { statusCode: 200, body: 'OK' }
  } catch (error) {
    if (lease) {
      try {
        await lease.release()
      } catch (releaseError) {
        logger.warn({ error: releaseError }, 'worker.lease_release_failed')
      }
    }
    logger.error(
      {
        model: CHAT_MODEL_LABEL,
        reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
        replyGateModel: REPLY_GATE_MODEL,
        durationMs: Date.now() - startedAt,
        error,
      },
      'worker.failed',
    )
    throw error
  } finally {
    if (heartbeat) {
      clearInterval(heartbeat)
    }
  }
}

export default agentWorker
