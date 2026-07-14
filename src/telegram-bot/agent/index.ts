import type { Message } from 'grammy/types'
import type { Bot, Context } from 'grammy/web'

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
  commandName?: AgentCommandName
}

export const AGENT_COMMANDS = [
  'q',
  'qq',
  'o',
  'gemma',
  'e',
  'ee',
  'ge',
  'gp',
  'de',
] as const

export type AgentCommandName = (typeof AGENT_COMMANDS)[number]

export function isAgentCommand(
  commandName: string,
): commandName is AgentCommandName {
  return (AGENT_COMMANDS as readonly string[]).includes(commandName)
}

interface AgentInvokeOptions {
  bypassReplyGate?: boolean
  stripCommand?: boolean
  commandName?: AgentCommandName
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
    commandName: options.commandName,
  }

  try {
    await invokeAgentLambda(payload)
  } catch (error) {
    logger.error({ error }, 'Failed to invoke agent Lambda')
  }
}

export async function handleAgenticCommand(
  ctx: Context,
  commandName: AgentCommandName,
): Promise<void> {
  if (!ctx.message) {
    return
  }

  await handleMessageWithAgent(ctx.message as Message, {
    bypassReplyGate: true,
    stripCommand: true,
    commandName,
  })
}

export function setupAgentCommands(bot: Bot): void {
  for (const commandName of AGENT_COMMANDS) {
    bot.command(commandName, (ctx) => handleAgenticCommand(ctx, commandName))
  }
}
