import pino from 'pino'
import type { Message } from 'telegram-typings'

export const logger = pino({
  level: process.env.AGENT_WORKER_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info',
  base: null,
})

export function getMessageLogMeta(message: Message) {
  return {
    chatId: message.chat?.id,
    messageId: message.message_id,
    fromId: message.from?.id,
    hasText: Boolean(message.text || message.caption),
    hasPhoto: Boolean(message.photo?.length),
  }
}
