import { webhookCallback } from 'grammy/web'
import type { Handler, Context as LambdaContext, SQSEvent } from 'aws-lambda'
import type { Update } from 'grammy/types'

import {
  createBot,
  handleSqsWorkerEvent,
  logger,
  runIdempotentWorkerTask,
  saveBotMessageMiddleware,
} from '@tg-bot/common'
import { setupAllCommands } from './setup-commands'

const bot = createBot()

bot.use(saveBotMessageMiddleware)

// Setup all commands with sync mode (no Lambda deferral)
setupAllCommands(bot, false)

const handleUpdate = webhookCallback(bot, 'aws-lambda-async', {
  // 5 minutes timeout
  timeoutMilliseconds: 300_000,
})

export const processTelegramReply = async (
  event: Update,
  context: LambdaContext,
) => {
  const message = event.message
  if (!message?.chat.id || !message.message_id) {
    logger.warn({ updateId: event.update_id }, 'reply_worker.invalid_payload')
    return { statusCode: 200, body: 'Invalid payload' }
  }

  try {
    const result = await runIdempotentWorkerTask({
      namespace: 'reply-worker',
      chatId: message.chat.id,
      messageId: message.message_id,
      ownerToken: context.awsRequestId,
      task: () =>
        handleUpdate({ body: JSON.stringify(event), headers: {} }, context),
    })

    if (result.duplicate) {
      logger.info(
        { chatId: message.chat.id, messageId: message.message_id },
        'reply_worker.duplicate_skipped',
      )
      return { statusCode: 200, body: 'Duplicate' }
    }

    return {
      statusCode: 200,
      body: 'OK',
    }
  } catch (error) {
    logger.error({ error }, 'reply_worker.failed')
    throw error
  }
}

const telegramReplyWorker = (
  event: Update | SQSEvent,
  context: LambdaContext,
) => handleSqsWorkerEvent('reply', event, context, processTelegramReply)

export default telegramReplyWorker satisfies Handler<Update | SQSEvent>
