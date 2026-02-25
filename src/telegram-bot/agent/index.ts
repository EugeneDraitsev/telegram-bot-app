import type { Message } from 'telegram-typings'

import { collectMessageImageFileIds, invokeAgentLambda } from '@tg-bot/common'

export interface AgentPayload {
  message: Message
  imageFileIds?: string[]
}

/**
 * Main entry point for handling messages with the agent.
 * Waits only for Lambda async invoke ACK, not for worker completion.
 */
export async function handleMessageWithAgent(message: Message): Promise<void> {
  const chatId = message.chat?.id
  if (!chatId) {
    return
  }

  // Invoke agent worker Lambda async and return immediately.
  // Worker handles chat-enabled checks and quick filtering.
  const payload: AgentPayload = {
    message,
    imageFileIds: collectMessageImageFileIds(message),
  }

  try {
    await invokeAgentLambda(payload)
  } catch (error) {
    console.error('Failed to invoke agent Lambda', error)
  }
}
