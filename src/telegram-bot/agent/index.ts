import type { Message } from 'grammy/types'
import type { Bot, Context } from 'grammy/web'

import {
  enqueueAgentWorker,
  getParsedText,
  isAgenticChatEnabled,
} from '@tg-bot/common'

export interface AgentPayload {
  message: Message
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
  'omni',
  'lyria',
  'lyriapro',
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
 * Waits only for the SQS SendMessage ACK, not for worker completion.
 */
export async function handleMessageWithAgent(
  message: Message,
  options: AgentInvokeOptions = {},
): Promise<void> {
  const chatId = message.chat?.id
  // A short cached DynamoDB read is cheaper than an SQS message plus a worker
  // invocation. The worker repeats the check as a defense against stale cache
  // entries and direct/retried queue deliveries.
  if (!chatId || !(await isAgenticChatEnabled(chatId))) {
    return
  }

  const agentMessage = options.stripCommand
    ? stripCommandText(message)
    : message

  // Enqueue the agent job and return after SQS accepts it. The worker still
  // owns the /toggle check and quick filtering, and re-fetches media from
  // Telegram using the file_ids carried inside `message`.
  const payload: AgentPayload = {
    message: agentMessage,
    bypassReplyGate: options.bypassReplyGate,
    commandName: options.commandName,
  }

  await enqueueAgentWorker(payload)
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
