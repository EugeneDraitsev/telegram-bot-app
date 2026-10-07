import { createHash } from 'node:crypto'
import type { Message } from 'grammy/types'

/** Stable actor attribution within the API's 64-character identifier limit. */
export function getMessageSafetyIdentifier(
  message?: Message,
): string | undefined {
  if (!message) return undefined
  const actor = message.sender_chat
    ? `sender-chat:${message.sender_chat.id}`
    : message.from
      ? `user:${message.from.id}`
      : message.chat
        ? `chat:${message.chat.id}`
        : undefined
  return actor ? createHash('sha256').update(actor).digest('hex') : undefined
}
