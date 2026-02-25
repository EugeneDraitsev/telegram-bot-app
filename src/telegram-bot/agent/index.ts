import type { Message } from 'telegram-typings'

import { getLargestPhoto, invokeAgentLambda } from '@tg-bot/common'

export interface AgentPayload {
  message: Message
  imageFileIds?: string[]
}

/**
 * Collect image file IDs from the message, its reply, and any extra album messages.
 */
function collectImageFileIds(
  message: Message,
  extraMessages: Message[] = [],
): string[] {
  const ids = [
    getLargestPhoto(message)?.file_id,
    getLargestPhoto(message.reply_to_message)?.file_id,
    ...extraMessages.map((m) => getLargestPhoto(m)?.file_id),
    message.reply_to_message?.sticker?.file_id,
  ].filter((id): id is string => Boolean(id))

  return [...new Set(ids)]
}

/**
 * Main entry point for handling messages with the agent.
 * Waits only for Lambda async invoke ACK, not for worker completion.
 */
export async function handleMessageWithAgent(
  message: Message,
  extraMessages: Message[] = [],
): Promise<void> {
  const chatId = message.chat?.id
  if (!chatId) {
    return
  }

  // Invoke agent worker Lambda async and return immediately.
  // Worker handles chat-enabled checks and quick filtering.
  const payload: AgentPayload = {
    message,
    imageFileIds: collectImageFileIds(message, extraMessages),
  }

  try {
    await invokeAgentLambda(payload)
  } catch (error) {
    console.error('Failed to invoke agent Lambda', error)
  }
}
