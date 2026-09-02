import type { Handler, Context as LambdaContext, SQSEvent } from 'aws-lambda'
import type { Message } from 'grammy/types'
import type { Context } from 'grammy/web'

import {
  type BotIdentity,
  createBot,
  getMediaGroupMessages,
  getMessageLogMeta,
  getMultimodalMediaData,
  handleSqsWorkerEvent,
  isAgenticChatEnabled,
  logger,
} from '@tg-bot/common'
import {
  REPLY_GATE_MODEL,
  resolveAgentChatModel,
  runAgenticLoop,
} from './agent'
import { prepareAgentCommandMessage } from './commands'
import { type AgentWorkerLease, acquireAgentWorkerLease } from './idempotency'

const bot = createBot()

export interface AgentWorkerPayload {
  message: Message
  botInfo?: BotIdentity
  bypassReplyGate?: boolean
  commandName?: string
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

export const processAgentWorker = async (
  event: AgentWorkerPayload,
  context: LambdaContext,
) => {
  const startedAt = Date.now()
  let lease: AgentWorkerLease | undefined
  const chatModel = resolveAgentChatModel(event?.commandName)
  try {
    const {
      message: incomingMessage,
      botInfo,
      bypassReplyGate,
      commandName,
    } = event

    if (!incomingMessage?.chat?.id) {
      logger.error(
        {
          reason: 'missing_message_chat_id',
        },
        'worker.invalid_payload',
      )
      return { statusCode: 200, body: 'Invalid payload' }
    }

    const message = prepareAgentCommandMessage(incomingMessage, commandName)

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

    logger.info(
      {
        ...messageMeta,
        model: chatModel.label,
        reasoningEffort: chatModel.reasoningEffort,
        replyGateModel: REPLY_GATE_MODEL,
        bypassReplyGate: Boolean(bypassReplyGate),
        commandName,
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
      {
        bypassReplyGate,
        commandName,
      },
    )
    logger.info(
      {
        ...messageMeta,
        model: chatModel.label,
        reasoningEffort: chatModel.reasoningEffort,
        replyGateModel: REPLY_GATE_MODEL,
        durationMs: Date.now() - startedAt,
        mediaCount: mediaData.mediaBuffers.length,
        bypassReplyGate: Boolean(bypassReplyGate),
        commandName,
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
        ...(event.message ? getMessageLogMeta(event.message) : {}),
        model: chatModel.label,
        reasoningEffort: chatModel.reasoningEffort,
        replyGateModel: REPLY_GATE_MODEL,
        durationMs: Date.now() - startedAt,
        commandName: event.commandName,
        error,
      },
      'worker.failed',
    )
    throw error
  }
}

const agentWorker = (
  event: AgentWorkerPayload | SQSEvent,
  context: LambdaContext,
) => handleSqsWorkerEvent('agent', event, context, processAgentWorker)

export default agentWorker satisfies Handler<AgentWorkerPayload | SQSEvent>
