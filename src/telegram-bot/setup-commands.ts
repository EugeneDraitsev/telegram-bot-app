import type { Bot } from 'grammy/web'
import type { Message } from 'telegram-typings'

import { getMediaGroupMessages } from '@tg-bot/common'
import { handleMessageWithAgent } from './agent'
import { installCommandRegistry } from './command-registry'
import { setupAgenticConfig } from './configuration-commands'
import setupCurrencyCommands from './currency'
import setupDat1coCommands from './dat1co'
import setupExternalApisCommands from './external-apis'
import setupGoogleCommands from './google'
import setupOpenAiCommands from './open-ai'
import { handlePhotoMessage } from './photo-router'
import setupTextCommands from './text'
import setupUsersCommands from './users'

/**
 * Sets up all bot commands with unified configuration.
 * @param bot - The grammy Bot instance
 * @param deferredCommands - If true, long-running commands are executed asynchronously via Lambda
 */
export const setupAllCommands = (bot: Bot, deferredCommands: boolean) => {
  const commandRegistry = installCommandRegistry(bot)

  // /h <text?> - huyator
  // /y <text?> - yasnoficator
  // /dice <number?> - throw a die
  // /8 <text?> - magic 8 ball
  // /shrug - ¯\_(ツ)_/¯
  // /ps <text> - punto switcher
  setupTextCommands(bot)

  // /q /qq <text, image> - generate chat completion with gemini-3-flash-preview
  // /o <text, image> - generate chat completion with gemini-3.1-pro-preview
  // /g <text> - search random image in google search
  // /t <text> - translate detected language to russian / english
  // /tb, /tr, /tp, /ts, /td, /te - translate to specific languages
  // /v <text> - search random video in YouTube
  // /ge <text, image> - generate image with Gemini
  setupGoogleCommands(bot, { deferredCommands })

  // /c - get currency rates
  setupCurrencyCommands(bot)

  // /z - get chat statistics for all time
  // /s - get chat statistics for last 24 hours
  // /all - ping all active users in chat
  // /x <hours?> - show AI metrics dashboard
  setupUsersCommands(bot)

  // /w <text> - search wikipedia
  // /p <text> - get horoscope
  // /f <text?> - get weather forecast
  setupExternalApisCommands(bot)

  // /e, /ee <text, image> - generate or edit images with gpt-image-1.5
  setupOpenAiCommands(bot, { deferredCommands })

  // /de <text> - generate image with dat1co
  // /gemma <text, image> - generate with Gemma model
  setupDat1coCommands(bot, { deferredCommands })

  // /toggle - enable/disable agentic bot for the chat
  setupAgenticConfig(bot)

  // Photo message handler for multimodal commands.
  // If no command matches, fall through to the agentic handler.
  bot.on('message:photo', async (ctx) => {
    const handled = handlePhotoMessage(ctx, deferredCommands)
    if (!handled && ctx.message?.caption) {
      const extraMessages = await getMediaGroupMessages(ctx)
      await handleMessageWithAgent(ctx.message as Message, extraMessages)
    }
  })

  return commandRegistry
}
