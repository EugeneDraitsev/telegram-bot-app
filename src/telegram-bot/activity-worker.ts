import type { Context, Handler } from 'aws-lambda'
import type { Message } from 'grammy/types'

import {
  isAiEnabledChat,
  logger,
  runIdempotentWorkerTask,
  saveEvent,
  saveMessage,
  updateStatistics,
} from '@tg-bot/common'

export interface ActivityWorkerPayload {
  message?: Message
  command?: string
}

const activityWorker = async (
  event: ActivityWorkerPayload,
  context: Pick<Context, 'awsRequestId'>,
) => {
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

  const taskDefinitions = [
    {
      namespace: 'activity-statistics',
      task: () => updateStatistics(message.from, chat),
    },
    {
      namespace: 'activity-event',
      task: () =>
        saveEvent(
          message.from,
          chat.id,
          event.command ?? '',
          message.date,
          message.message_id,
        ),
    },
  ]

  if (isAiEnabledChat(chat.id)) {
    taskDefinitions.push({
      namespace: 'activity-history',
      task: () => saveMessage(message, chat.id),
    })
  }

  const results = await Promise.allSettled(
    taskDefinitions.map(({ namespace, task }) =>
      runIdempotentWorkerTask({
        namespace,
        chatId: chat.id,
        messageId: message.message_id,
        ownerToken: `${context.awsRequestId}:${namespace}`,
        task,
      }),
    ),
  )
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

export default activityWorker satisfies Handler<ActivityWorkerPayload>
