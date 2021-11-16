import '@tg-bot/dynamo-optimization'

import { Telegraf } from 'telegraf'
import { Message } from 'telegram-typings'
import { APIGatewayProxyHandler } from 'aws-lambda'
import { saveEvent, updateChatMetaData, updateStatistics, findCommand } from '@tg-bot/common'

import setupCommands from './bot/commands'

const bot = new Telegraf(process.env.TOKEN as string)

bot.use(async (ctx, next) => {
  const { chat } = ctx
  const message = ctx.message as Message
  if (chat && message) {
    const command = findCommand(message.text)

    updateChatMetaData(chat.id)

    await Promise.all([
      updateStatistics(message.from, chat),
      saveEvent(message.from, chat.id, message.date, command),
      next?.(),
    ])
  }
})

setupCommands(bot)

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
