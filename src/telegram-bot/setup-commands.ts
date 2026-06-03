import type { Bot, Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { invokeReplyLambda, logger } from '@tg-bot/common'
import { DIRECT_AGENT_COMMANDS, handleMessageWithAgent } from './agent'
import {
  type CommandRegistry,
  getRegisteredCommandName,
  installCommandRegistry,
  isCommandAddressedToAnotherBot,
} from './command-registry'
import { setupAgenticConfig } from './configuration-commands'
import setupCurrencyCommands from './currency'
import setupDat1coCommands from './dat1co'
import setupExternalApisCommands from './external-apis'
import setupGoogleCommands from './google'
import setupOpenAiCommands from './open-ai'
import setupTextCommands from './text'
import setupUsersCommands from './users'

type MessageTextKey = 'text' | 'caption'

function normalizeCommandText(
  text: string,
  entity: { offset: number; length: number },
  commandName: string,
): string {
  const start = entity.offset
  const end = entity.offset + entity.length
  const normalizedCommand = text
    .slice(start, end)
    .replace(/^\/[A-Za-z0-9_]+/, `/${commandName}`)

  return `${text.slice(0, start)}${normalizedCommand}${text.slice(end)}`
}

function normalizeCommandMessage(
  message: Message,
  commandName: string,
): Message {
  const key: MessageTextKey | undefined =
    typeof message.text === 'string'
      ? 'text'
      : typeof message.caption === 'string'
        ? 'caption'
        : undefined
  const entities = key === 'text' ? message.entities : message.caption_entities
  const entity = entities?.find(
    (item) => item.type === 'bot_command' && item.offset === 0,
  )
  if (!key || !entity) {
    return message
  }

  const normalizedText = normalizeCommandText(
    message[key] ?? '',
    entity,
    commandName,
  )
  if (key === 'text' && normalizedText === message.text) {
    return message
  }

  if (key === 'caption') {
    return {
      ...message,
      text: normalizedText,
      entities: message.caption_entities,
    }
  }

  return { ...message, text: normalizedText }
}

function normalizeCommandUpdate(
  update: Context['update'],
  commandName: string,
) {
  const message = (update as { message?: Message }).message
  if (!message) {
    return update
  }

  const normalizedMessage = normalizeCommandMessage(message, commandName)
  return normalizedMessage === message
    ? update
    : { ...update, message: normalizedMessage }
}

async function deferRegisteredCommand(
  ctx: Context,
  commandRegistry: CommandRegistry,
): Promise<boolean> {
  const message = ctx.message as Message | undefined
  const commandName = getRegisteredCommandName(
    message,
    commandRegistry,
    ctx.me?.username,
  )
  if (!message || !commandName) {
    return false
  }

  if (DIRECT_AGENT_COMMANDS.includes(commandName)) {
    await handleMessageWithAgent(message, {
      bypassReplyGate: true,
      stripCommand: true,
    })
    return true
  }

  try {
    await invokeReplyLambda(normalizeCommandUpdate(ctx.update, commandName))
  } catch (error) {
    logger.error({ error }, 'Failed to invoke reply worker')
  }
  return true
}

/**
 * Sets up all bot commands with unified configuration.
 * @param bot - The grammy Bot instance
 * @param deferredCommands - If true, long-running commands are executed asynchronously via Lambda
 */
export const setupAllCommands = (bot: Bot, deferredCommands: boolean) => {
  const commandRegistry = installCommandRegistry(bot)

  if (deferredCommands) {
    bot.on('message', async (ctx, next) => {
      if (await deferRegisteredCommand(ctx, commandRegistry)) {
        return
      }

      await next()
    })
  }

  // /h <text?> - huyator
  // /y <text?> - yasnoficator
  // /dice <number?> - throw a die
  // /8 <text?> - magic 8 ball
  // /shrug - ¯\_(ツ)_/¯
  // /ps <text> - punto switcher
  setupTextCommands(bot)

  // /q /qq <text, image> - invoke the agentic bot without reply gate
  // /o <text, image> - generate chat completion with gpt-5.5 medium reasoning
  // /g <text> - search random image in google search
  // /t <text> - translate detected language to russian / english
  // /tb, /tr, /tp, /ts, /td, /te - translate to specific languages
  // /v <text> - search random video in YouTube
  // /ge <text, image> - generate image with Gemini
  setupGoogleCommands(bot)

  // /c - get currency rates
  setupCurrencyCommands(bot)

  // /z - get chat statistics for all time
  // /s - get chat statistics for last 24 hours
  // /all - ping all active users in chat
  // /all_opt_out - remove yourself from /all mentions
  // /all_opt_in  - add yourself back to /all mentions
  // /x <hours?> - show AI metrics dashboard
  setupUsersCommands(bot)

  // /w <text> - search wikipedia
  // /p <text> - get horoscope
  // /f <text?> - get weather forecast
  setupExternalApisCommands(bot)

  // /e, /ee <text, image> - generate or edit images with gpt-image-2
  setupOpenAiCommands(bot)

  // /de <text> - generate image with dat1co
  // /gemma <text, image> - generate with Gemma 4 model
  setupDat1coCommands(bot)

  // /toggle - enable/disable agentic bot for the chat
  setupAgenticConfig(bot)

  // Smart agentic responses for non-command messages.
  bot.on('message', async (ctx, next) => {
    await next()

    const message = ctx.message as Message
    const chatId = ctx.chat?.id
    const isCommand = Boolean(
      getRegisteredCommandName(message, commandRegistry, ctx.me?.username),
    )
    const isOtherBotCommand = isCommandAddressedToAnotherBot(
      message,
      ctx.me?.username,
    )
    const isCaptionlessAlbumMessage = Boolean(
      message.media_group_id && !message.text && !message.caption,
    )

    if (
      isCommand ||
      isOtherBotCommand ||
      isCaptionlessAlbumMessage ||
      !chatId
    ) {
      return
    }

    await handleMessageWithAgent(message)
  })

  return commandRegistry
}
