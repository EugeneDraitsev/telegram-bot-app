import { hydrateReply } from '@grammyjs/parse-mode'
import { Bot, type Context, webhookCallback } from 'grammy'

import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { APIGatewayProxyHandler } from 'aws-lambda'
import type { Chat, Message } from 'telegram-typings'

import { findCommand, saveEvent, updateStatistics } from '@tg-bot/common'
import setupCurrencyCommands from './currency'
import setupExternalApisCommands from './external-apis'
import setupGoogleCommands, { setupMultimodalGeminiCommands } from './google'
import setupOpenAiCommands, { setupMultimodalOpenAiCommands } from './open-ai'
import setupTextCommands from './text'
import { saveMessage } from './upstash'
import setupUsersCommands from './users'
import { cleanGeminiMessage, isAiEnabledChat } from './utils'

const bot = new Bot<ParseModeFlavor<Context>>(process.env.TOKEN || '', {
  client: {
    // We accept the drawback of webhook replies for typing status.
    canUseWebhookReply: (method) => method === 'sendChatAction',
  },
})

bot.use(hydrateReply)

const handleUpdate = webhookCallback(bot, 'aws-lambda-async')

bot.use(async (ctx, next) => {
  const originalReply = ctx.reply.bind(ctx)

  ctx.reply = async (text, ...args) => {
    const sentMessage = await originalReply(text, ...args)

    if (isAiEnabledChat(sentMessage.chat.id)) {
      sentMessage.text = cleanGeminiMessage(sentMessage.text)
      saveMessage(sentMessage, sentMessage.chat.id).catch((error) =>
        console.error('saveHistory error: ', error),
      )
    }

    return sentMessage
  }

  await next()
})

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

// /g <text> - search random image in google search
// /t <text> - translate text from detected language to russian / english (if source language is russian)
// /tb <text> - translate text from detected language to belarusian
// /tp <text> - translate text from detected language to polish
// /ts <text> - translate text from detected language to swedish
// /td <text> - translate text from detected language to deutsch
// /tr <text> - translate text from detected language to russian
// /te <text> - translate text from detected language to english
// /v <text> -  search random video in YouTube
setupGoogleCommands(bot)

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

// /q <text | image-with-caption> - generate chat completion with 4o
// /e <text> - generate image
// /o <text> - generate chat completion with o3-mini
setupOpenAiCommands(bot)

bot.on('message:photo', (ctx) => {
  if (ctx.message?.caption?.startsWith('/o')) {
    return setupMultimodalGeminiCommands(ctx)
  }
  if (ctx.message?.caption?.startsWith('/q')) {
    return setupMultimodalOpenAiCommands(ctx)
  }

  return
})

const telegramBotHandler: APIGatewayProxyHandler = async (event, context) => {
  try {
    await handleUpdate(
      { body: event.body ?? '', headers: event.headers },
      context,
    )

    return { body: JSON.stringify({ body: event.body ?? '' }), statusCode: 200 }
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
