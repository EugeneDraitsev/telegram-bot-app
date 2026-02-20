import type { Message } from 'telegram-typings'

import { getLargestPhoto, invokeAgentLambda } from '@tg-bot/common'

export interface AgentPayload {
  message: Message
  imageFileIds?: string[]
}

function collectImageFileIds(message: Message): string[] {
  const ids = [
    getLargestPhoto(message)?.file_id,
    getLargestPhoto(message.reply_to_message)?.file_id,
    message.reply_to_message?.sticker?.file_id,
  ].filter((id): id is string => Boolean(id))

  return [...new Set(ids)]
}

/**
 * Main entry point for handling messages with the agent.
 * Returns quickly after invoking Lambda async.
 */
export function handleMessageWithAgent(message: Message): void {
  const chatId = message.chat?.id
  if (!chatId) {
    return
  }

  // Invoke agent worker Lambda async and return immediately.
  // Worker handles chat-enabled checks and quick filtering.
  const payload: AgentPayload = {
    message,
    imageFileIds: collectImageFileIds(message),
  }

  void invokeAgentLambda(payload).catch((error) =>
    console.error('Failed to invoke agent Lambda', error),
  )

  // Return immediately - worker will handle the response
}
