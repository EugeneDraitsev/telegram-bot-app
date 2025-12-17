import { webhookCallback } from 'grammy/web'
import type { APIGatewayProxyHandler } from 'aws-lambda'
import type { Chat, Message } from 'telegram-typings'

import { findCommand, saveEvent, updateStatistics } from '@tg-bot/common'
import setupCurrencyCommands from './currency'
import setupDat1coCommands, { setupGemmaDat1coCommands } from './dat1co'
import setupExternalApisCommands from './external-apis'
import setupGoogleCommands, {
  setupImageGenerationGeminiCommands,
  setupMultimodalGeminiCommands,
} from './google'
import setupOpenAiCommands, {
  setupImageGenerationOpenAiCommands,
} from './open-ai'
import setupTextCommands from './text'
import { saveMessage } from './upstash'
import setupUsersCommands from './users'
import { createBot, saveBotMessageMiddleware } from './utils'

const bot = createBot()

bot.use(saveBotMessageMiddleware)

bot.use(async (ctx, next) => {
  const { chat } = ctx
  const message = ctx.message as Message
  if (chat && message) {
    const command = findCommand(message.text)
    const chat = await ctx
      .getChat()
      .catch((error) => console.error('getChat error: ', error))

    try {
      await Promise.all([
        updateStatistics(message.from, chat as Chat).catch((error) =>
          console.error('updateStatistics error: ', error),
        ),
        saveEvent(message.from, chat?.id, command, message.date).catch(
          (error) => console.error('saveEvent error: ', error),
        ),
        saveMessage(message, chat?.id).catch((error) =>
          console.error('saveHistory error: ', error),
        ),
        next?.(),
      ])
    } catch (error) {
      console.error('Root error: ', error)
    }
  }
})

// /h <text?> - huyator
// /y <text?> - yasnoficator
// /dice <number?> - throw a die
// /8 <text?> - magic 8 ball
// /shrug - ¯\_(ツ)_/¯
// /ps <text> - punto switcher
setupTextCommands(bot)

// /q /qq <text, image> - generate chat completion with gemini-3-flash-preview
// /o <text, image> - generate chat completion with gemini-3-pro-preview
// /g <text> - search random image in google search
// /t <text> - translate detected language to russian / english
// /tb <text> - translate detected language to belarusian
// /tp <text> - translate detected language to polish
// /ts <text> - translate detected language to swedish
// /td <text> - translate detected language to deutsch
// /tr <text> - translate detected language to russian
// /te <text> - translate detected language to english
// /v <text> -  search random video in YouTube
setupGoogleCommands(bot, { deferredCommands: true })

// /c - get currency rates
setupCurrencyCommands(bot)

// /z - get chat statistics for all time
// /s - get chat statistics for last 24 hours
// /all - ping all active users in chat
setupUsersCommands(bot)

// /w <text> - search wikipedia
// /p <text> - get horoscope
// /f <text?> - get weather forecast
setupExternalApisCommands(bot)

// /e, /ee <text, image> - generate or edit images with gpt-image-1.5
setupOpenAiCommands(bot, { deferredCommands: true })

// /de <text> - generate image with dat1co
setupDat1coCommands(bot, { deferredCommands: true })

bot.on('message:photo', (ctx) => {
  if (ctx.message?.caption?.startsWith('/o')) {
    return setupMultimodalGeminiCommands(ctx, true, 'gemini-3-pro-preview')
  }

  if (ctx.message?.caption?.startsWith('/q')) {
    return setupMultimodalGeminiCommands(ctx, true, 'gemini-3-flash-preview')
  }

  if (ctx.message?.caption?.startsWith('/e')) {
    return setupImageGenerationOpenAiCommands(ctx, 'gpt-image-1.5', true)
  }

  if (ctx.message?.caption?.startsWith('/gemma')) {
    return setupGemmaDat1coCommands(ctx, true)
  }

  if (
    ctx.message?.caption?.startsWith('/ge') &&
    !ctx.message?.caption?.startsWith('/gemma')
  ) {
    return setupImageGenerationGeminiCommands(ctx, true)
  }

  return
})

const handleUpdate = webhookCallback(bot, 'aws-lambda-async')

const telegramBotHandler: APIGatewayProxyHandler = async (event, context) => {
  try {
    await handleUpdate(
      { body: event.body ?? '', headers: event.headers },
      context,
    )

    return {
      statusCode: 200,
      body: JSON.stringify({ body: event.body ?? '' }),
    }
  } catch (e) {
    console.error('Bot handler error: ', e)
    return {
      body: JSON.stringify({ message: 'Something went wrong' }),
      // we need to send 200 here to avoid issue with telegram attempts to resend you a message
      statusCode: 200,
    }
  }
}

export default telegramBotHandler
