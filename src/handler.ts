import 'source-map-support/register' // eslint-disable-line import/no-extraneous-dependencies
import Telegraf, { ContextMessageUpdate } from 'telegraf'
import { Message, Chat } from 'telegram-typings'

import { isBotCommand, parseMessage } from './utils'
import { saveEvent, updateStatistics } from './core'
import setupCommands from './commands'
import './dynamo-optimization'

export interface Context extends ContextMessageUpdate {
  message: Message,
  chat: Chat,
  command: string,
  text: string
  replyId: number
}

const bot = new Telegraf(process.env.TOKEN!)

bot.use(async (ctx: Context, next) => {
  const { chat, message } = ctx
  if (chat && message) {
    const { message_id, reply_to_message } = message
    if (isBotCommand(message.entities!)) {
      const [command, text] = parseMessage(message.text)
      const replyId = text ? message_id : (reply_to_message && reply_to_message!.message_id) || message_id

      ctx.command = command
      ctx.text = text
      ctx.replyId = replyId
    }

    await Promise.all([
      updateStatistics(message.from!, chat.id),
      saveEvent(message.from!, chat.id!, message.date, ctx.command !),
      next!(),
    ])
  }
})

setupCommands(bot)

export default async (event: any) => {
  try {
    const body = JSON.parse(event.body)
    await bot.handleUpdate(body)
    const message = '' // await processRequest(body)
    return { body: JSON.stringify({ body, message }), statusCode: 200 }
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    return {
      body: JSON.stringify({ message: 'something went wrong 😿' }),
      statusCode: 200,
    }
  }
}