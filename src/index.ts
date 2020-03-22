import 'source-map-support/register' // eslint-disable-line import/no-extraneous-dependencies
import Telegraf, { ContextMessageUpdate } from 'telegraf'
import { Message, Chat } from 'telegram-typings'
import AWS from 'aws-sdk'
import { captureAWS } from 'aws-xray-sdk'
import { get } from 'lodash'

import { isBotCommand, parseMessage } from './utils'
import { saveEvent, updateChatS3Data, updateStatistics } from './core'
import setupCommands from './commands'
import './dynamo-optimization'

if (!process.env.IS_LOCAL) {
  captureAWS(AWS)
}

export interface Context extends ContextMessageUpdate {
  message: Message;
  chat: Chat;
  command: string;
  text: string;
  replyId: number;
}

const bot = new Telegraf(process.env.TOKEN as string)

bot.use(async (ctx: Context, next) => {
  const { chat, message } = ctx
  if (chat && message) {
    const { message_id, reply_to_message } = message
    if (isBotCommand(message?.entities)) {
      const [command, text] = parseMessage(message.text)
      const replyId = text ? message_id : (reply_to_message && reply_to_message?.message_id) || message_id

      ctx.command = command
      ctx.text = text || get(reply_to_message, 'text', '')
      ctx.replyId = replyId
    }

    updateChatS3Data(chat.id)

    await Promise.all([
      updateStatistics(message.from, chat.id),
      saveEvent(message.from, chat.id, message.date, ctx.command),
      next?.(),
    ])
  }
})

setupCommands(bot)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
