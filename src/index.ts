import 'source-map-support/register' // eslint-disable-line import/no-extraneous-dependencies
import { Telegraf } from 'telegraf'
import { Message } from 'telegram-typings'
import AWS from 'aws-sdk'
import { captureAWS } from 'aws-xray-sdk'

import { saveEvent, updateChatMetaData, updateStatistics } from './aws'
import { findCommand } from './utils'
import setupCommands from './commands'
import './dynamo-optimization'

if (!process.env.IS_LOCAL) {
  captureAWS(AWS)
}

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any,@typescript-eslint/explicit-module-boundary-types
export const handler = async (event: any): Promise<{ body: string; statusCode: number }> => {
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
