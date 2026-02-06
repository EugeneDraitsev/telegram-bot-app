import { webhookCallback } from 'grammy/web'
import type { APIGatewayProxyHandler } from 'aws-lambda'
import type { Chat, Message } from 'telegram-typings'

import {
  createBot,
  findCommand,
  isAiEnabledChat,
  saveBotMessageMiddleware,
  saveEvent,
  saveMessage,
  updateStatistics,
} from '@tg-bot/common'
import { handleMessageWithAgent } from './agent'
import { setupAllCommands } from './setup-commands'

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

// Setup all commands with deferred mode (async via Lambda)
setupAllCommands(bot, true)

// Smart Agentic responses - bot autonomously decides what to do
bot.on('message', async (ctx) => {
  const message = ctx.message as Message
  const chatId = ctx.chat?.id
  const command = findCommand(message.text)

  if (command || !chatId || !isAiEnabledChat(chatId)) {
    return
  }

  handleMessageWithAgent(message, ctx).catch((error) =>
    console.error('handleMessageWithAgent error: ', error),
  )
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
