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
  runIdempotentWorkerTask,
} from '@tg-bot/common'
import { REPLY_GATE_ROLE, resolveAgentChatRole, runAgenticLoop } from './agent'

const bot = createBot()

export interface AgentWorkerPayload {
  message: Message
  bypassReplyGate?: boolean
  commandName?: string
}

let cachedBotInfo: BotIdentity | undefined

async function resolveBotInfo(): Promise<BotIdentity | undefined> {
  if (cachedBotInfo?.id) {
    return cachedBotInfo
  }

  try {
    const me = await bot.api.getMe()
    cachedBotInfo = { id: me.id, username: me.username }
    return cachedBotInfo
  } catch (error) {
    logger.warn({ error }, 'worker.bot_info_unavailable')
    return undefined
  }
}

export const processAgentWorker = async (
  event: AgentWorkerPayload,
  context: LambdaContext,
) => {
  const startedAt = Date.now()
  const chatModel = resolveAgentChatRole(event?.commandName).primary
  try {
    const { message, bypassReplyGate, commandName } = event

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

    const result = await runIdempotentWorkerTask({
      namespace: 'agent-worker',
      chatId: message.chat.id,
      messageId: message.message_id,
      ownerToken: context.awsRequestId,
      task: async () => {
        logger.info(
          {
            ...messageMeta,
            model: chatModel.label,
            reasoningEffort: chatModel.reasoningEffort,
            replyGateModel: REPLY_GATE_ROLE.primary.label,
            bypassReplyGate: Boolean(bypassReplyGate),
            commandName,
          },
          'worker.start',
        )

        const effectiveBotInfo = await resolveBotInfo()

        const ctx = {
          message,
          chat: message.chat,
          api: bot.api,
        } as unknown as Context
        let mediaCount = 0

        // Run the agentic loop with bot API
        await runAgenticLoop(message, bot.api, undefined, effectiveBotInfo, {
          bypassReplyGate,
          commandName,
          loadMedia: async () => {
            const extraMessages = await getMediaGroupMessages(ctx)
            const { mediaBuffers } = await getMultimodalMediaData(
              ctx,
              extraMessages,
            )
            mediaCount = mediaBuffers.length
            return mediaBuffers
          },
        })
        logger.info(
          {
            ...messageMeta,
            model: chatModel.label,
            reasoningEffort: chatModel.reasoningEffort,
            replyGateModel: REPLY_GATE_ROLE.primary.label,
            durationMs: Date.now() - startedAt,
            mediaCount,
            bypassReplyGate: Boolean(bypassReplyGate),
            commandName,
          },
          'worker.done',
        )
      },
    })
    if (result.duplicate) {
      logger.info(messageMeta, 'worker.duplicate_skipped')
      return { statusCode: 200, body: 'Duplicate' }
    }

    return { statusCode: 200, body: 'OK' }
  } catch (error) {
    logger.error(
      {
        ...(event.message ? getMessageLogMeta(event.message) : {}),
        model: chatModel.label,
        reasoningEffort: chatModel.reasoningEffort,
        replyGateModel: REPLY_GATE_ROLE.primary.label,
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
