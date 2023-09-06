import { Telegraf } from 'telegraf'
import type { Message } from 'telegram-typings'
import type { APIGatewayProxyHandler } from 'aws-lambda'

import { saveEvent, updateStatistics, findCommand } from '@tg-bot/common'
import setupTextCommands from './text'
import setupGoogleCommands from './google'
import setupCurrencyCommands from './currency'
import setupUsersCommands from './users'
import setupExternalApisCommands from './external-apis'
import setupOpenAiCommands from './open-ai'

const bot = new Telegraf(process.env.TOKEN as string)

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
        updateStatistics(message.from, chat).catch((error) =>
          console.error('updateStatistics error: ', error),
        ),
        saveEvent(message.from, chat?.id, command, message.date).catch(
          (error) => console.error('saveEvent error: ', error),
        ),
        next?.(),
      ])
    } catch (error) {
      console.error('Root error: ', error)
    }
  }
})

// <link> - random reply with 0.01% chance to links
// /h <text?> - huyator
// /y <text?> - yasnoficator
// /dice <number?> - throw a dice
// /8 <text?> - magic 8 ball
// /shrug - ¯\_(ツ)_/¯
// /ps <text> - punto switcher
// /za <text?> - make text more nazis
setupTextCommands(bot)

// /g <text> - search random image in google search
// /t <text> - translate text from detected language to russian / english (if source language is russian)
// /tb <text> - translate text from detected language to belarusian
// /tp <text> - translate text from detected language to polish
// /ts <text> - translate text from detected language to swedish
// /td <text> - translate text from detected language to deutsch
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

// /q <text> - generate chat completion
// /e <text> - generate image
setupOpenAiCommands(bot)

export const telegramBotHandler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : event // Identify lambda call vs http event
    await bot.handleUpdate(body)
    return { body: JSON.stringify({ body }), statusCode: 200 }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e)
    return {
      body: JSON.stringify({ message: 'Something went wrong' }),
      // we need to send 200 here to avoid issue with telegram attempts to resend you a message
      statusCode: 200,
    }
  }
}

export default telegramBotHandler
