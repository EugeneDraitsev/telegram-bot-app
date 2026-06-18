import type { Message, MessageEntity } from 'grammy/types'
import type { Bot } from 'grammy/web'

export type CommandRegistry = {
  has(command: string): boolean
}

const BOT_COMMAND_REGEX = /^\/([A-Za-z0-9_]+)(?:@([A-Za-z0-9_]+))?$/

type ParsedCommand = {
  command: string
  targetBot?: string
}

function normalizeCommand(command: string): string {
  return command.trim().replace(/^\/+/, '').replace(/@.*/, '').toLowerCase()
}

function normalizeBotUsername(username?: string): string | undefined {
  return username?.trim().replace(/^@/, '').toLowerCase() || undefined
}

function parseEntityCommand(
  text: string | undefined,
  entities: MessageEntity[] | undefined,
): ParsedCommand | null {
  const entity = entities?.find(
    (item) => item.type === 'bot_command' && item.offset === 0,
  )
  if (!text || !entity) {
    return null
  }

  const rawCommand = text.slice(entity.offset, entity.offset + entity.length)
  const match = rawCommand.match(BOT_COMMAND_REGEX)
  if (!match?.[1]) {
    return null
  }

  return {
    command: normalizeCommand(match[1]),
    targetBot: normalizeBotUsername(match[2]),
  }
}

function extractEntityCommand(
  text: string | undefined,
  entities: MessageEntity[] | undefined,
  botUsername?: string,
): string | null {
  const parsed = parseEntityCommand(text, entities)
  const ownBot = normalizeBotUsername(botUsername)
  if (parsed?.targetBot && ownBot && parsed.targetBot !== ownBot) {
    return null
  }

  return parsed?.command ?? null
}

export function isCommandAddressedToAnotherBot(
  message: Message | undefined,
  botUsername?: string,
): boolean {
  const ownBot = normalizeBotUsername(botUsername)
  if (!message || !ownBot) {
    return false
  }

  const targetBot =
    parseEntityCommand(message.text, message.entities)?.targetBot ??
    parseEntityCommand(message.caption, message.caption_entities)?.targetBot

  return Boolean(targetBot && targetBot !== ownBot)
}

export function installCommandRegistry(bot: Bot): CommandRegistry {
  const commands = new Set<string>()
  const originalCommand = bot.command.bind(bot) as Bot['command']
  ;(
    bot as unknown as {
      command: Bot['command']
    }
  ).command = ((command, ...middleware) => {
    const values = Array.isArray(command) ? command : [command]
    for (const value of values) {
      const normalized = normalizeCommand(String(value))
      if (normalized) {
        commands.add(normalized)
      }
    }

    return originalCommand(command, ...middleware)
  }) as Bot['command']

  return commands
}

export function getRegisteredCommandName(
  message: Message | undefined,
  registry: CommandRegistry,
  botUsername?: string,
): string | null {
  if (!message) {
    return null
  }

  const command =
    extractEntityCommand(message.text, message.entities, botUsername) ??
    extractEntityCommand(message.caption, message.caption_entities, botUsername)

  return command && registry.has(command) ? command : null
}
