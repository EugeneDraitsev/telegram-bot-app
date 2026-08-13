import type { Context, Handler, SQSEvent } from 'aws-lambda'
import type { Message } from 'grammy/types'

import {
  handleSqsWorkerEvent,
  logger,
  recordChatActivity,
  saveMessage,
} from '@tg-bot/common'

export interface ActivityWorkerPayload {
  message?: Message
  command?: string
}

/**
 * Both tasks are safe to replay, so redelivery needs no idempotency markers:
 * recordChatActivity counts inside a transaction gated on a conditional insert
 * of the message's own event item, and saveMessage adds an identical sorted-set
 * member with NX and a score derived from the message.
 */
export const processActivityWorker = async (event: ActivityWorkerPayload) => {
  const message = event.message
  const chat = message?.chat

  if (!message || !chat?.id) {
    logger.warn(
      {
        hasMessage: Boolean(message),
        chatId: chat?.id,
      },
      'activity.invalid_payload',
    )
    return
  }

  const tasks: Promise<unknown>[] = [
    recordChatActivity({
      userInfo: message.from,
      chat,
      command: event.command ?? '',
      date: message.date,
      messageId: message.message_id,
    }),
    // saveMessage owns the allowlist check, so activity tracking has one
    // authorization boundary instead of checking the same flag twice.
    saveMessage(message, chat.id),
  ]

  const results = await Promise.allSettled(tasks)
  const failures: unknown[] = []
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason }, 'activity.track_failed')
      failures.push(result.reason)
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, 'One or more activity tasks failed')
  }
}

const activityWorker = (
  event: ActivityWorkerPayload | SQSEvent,
  context: Pick<Context, 'awsRequestId'>,
) => handleSqsWorkerEvent('activity', event, context, processActivityWorker)

export default activityWorker satisfies Handler<
  ActivityWorkerPayload | SQSEvent
>
