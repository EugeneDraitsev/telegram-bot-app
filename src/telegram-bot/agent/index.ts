import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import {
  collectMessageImageFileIds,
  getParsedText,
  invokeAgentLambda,
  logger,
} from '@tg-bot/common'

export interface AgentPayload {
  message: Message
  imageFileIds?: string[]
  bypassReplyGate?: boolean
}

export const DIRECT_AGENT_COMMANDS = ['q', 'qq']

interface AgentInvokeOptions {
  bypassReplyGate?: boolean
  stripCommand?: boolean
}

function stripCommandText(message: Message): Message {
  if (typeof message.text === 'string') {
    return { ...message, text: getParsedText(message.text) }
  }

  if (typeof message.caption === 'string') {
    return { ...message, caption: getParsedText(message.caption) }
  }

  return message
}

/**
 * Main entry point for handling messages with the agent.
 * Waits only for Lambda async invoke ACK, not for worker completion.
 */
export async function handleMessageWithAgent(
  message: Message,
  options: AgentInvokeOptions = {},
): Promise<void> {
  const chatId = message.chat?.id
  if (!chatId) {
    return
  }

  const agentMessage = options.stripCommand
    ? stripCommandText(message)
    : message

  // Invoke agent worker Lambda async and return immediately.
  // Worker handles chat-enabled checks and quick filtering.
  const payload: AgentPayload = {
    message: agentMessage,
    imageFileIds: collectMessageImageFileIds(agentMessage),
    bypassReplyGate: options.bypassReplyGate,
  }

  try {
    await invokeAgentLambda(payload)
  } catch (error) {
    logger.error({ error }, 'Failed to invoke agent Lambda')
  }
}

export async function handleAgenticCommand(ctx: Context): Promise<void> {
  if (!ctx.message) {
    return
  }

  await handleMessageWithAgent(ctx.message as Message, {
    bypassReplyGate: true,
    stripCommand: true,
  })
}
