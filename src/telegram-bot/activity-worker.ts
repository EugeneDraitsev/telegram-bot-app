import type { Handler } from 'aws-lambda'
import type { Message } from 'grammy/types'

import {
  isAiEnabledChat,
  logger,
  saveEvent,
  saveMessage,
  updateStatistics,
} from '@tg-bot/common'

export interface ActivityWorkerPayload {
  message?: Message
  command?: string
}

const activityWorker: Handler<ActivityWorkerPayload> = async (event) => {
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

  const tasks = [
    updateStatistics(message.from, chat),
    saveEvent(message.from, chat.id, event.command ?? '', message.date),
  ]

  if (isAiEnabledChat(chat.id)) {
    tasks.push(saveMessage(message, chat.id))
  }

  const results = await Promise.allSettled(tasks)
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason }, 'activity.track_failed')
    }
  }
}

export default activityWorker
