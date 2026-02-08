import type { Bot } from 'grammy/web'
import type { Message } from 'telegram-typings'

export type CommandRegistry = Set<string>

const LEADING_COMMAND_REGEX = /^\/([A-Za-z0-9_]+)(?:@\w+)?(?:\s|$)/

function normalizeCommand(command: string): string {
  return command.trim().replace(/^\/+/, '').replace(/@.*/, '').toLowerCase()
}

function extractLeadingCommand(text?: string): string | null {
  if (!text) {
    return null
  }

  const match = text.trimStart().match(LEADING_COMMAND_REGEX)
  return match?.[1] ? normalizeCommand(match[1]) : null
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

export function isRegisteredCommandMessage(
  message: Message | undefined,
  registry: CommandRegistry,
): boolean {
  if (!message) {
    return false
  }

  const command =
    extractLeadingCommand(message.text) ??
    extractLeadingCommand(message.caption)
  return Boolean(command && registry.has(normalizeCommand(command)))
}
