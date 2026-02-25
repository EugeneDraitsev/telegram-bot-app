import { webhookCallback } from 'grammy/web'
import type { APIGatewayProxyHandler } from 'aws-lambda'
import type { Chat, Message } from 'telegram-typings'

import {
  createBot,
  findCommand,
  getMediaGroupMessages,
  saveBotMessageMiddleware,
  saveEvent,
  saveMessage,
  updateStatistics,
} from '@tg-bot/common'
import { handleMessageWithAgent } from './agent'
import { isRegisteredCommandMessage } from './command-registry'
import { setupAllCommands } from './setup-commands'

const bot = createBot()

bot.use(saveBotMessageMiddleware)

// Setup all commands with deferred mode (async via Lambda)
const commandRegistry = setupAllCommands(bot, true)

async function trackActivity(
  message: Message,
  chatFromCtx: Chat,
  chatInfo?: Chat,
) {
  const command = isRegisteredCommandMessage(message, commandRegistry)
    ? findCommand(message.text || message.caption)
    : ''

  await Promise.allSettled([
    updateStatistics(message.from, (chatInfo || chatFromCtx) as Chat),
    saveEvent(
      message.from,
      chatInfo?.id || chatFromCtx.id,
      command,
      message.date,
    ),
    saveMessage(message, chatInfo?.id || chatFromCtx.id),
  ]).catch((error) => console.error('Tracking error: ', error))
}

bot.use(async (ctx, next) => {
  const chatFromCtx = ctx.chat
  const message = ctx.message as Message
  if (chatFromCtx && message) {
    const chatInfo = await ctx
      .getChat()
      .catch((error) => console.error('getChat error: ', error))

    // Fire and forget tracking to not block the request
    void trackActivity(message, chatFromCtx, chatInfo as Chat)

    try {
      if (next) await next()
    } catch (error) {
      console.error('Root error: ', error)
    }
  }
})

// Smart Agentic responses - bot autonomously decides what to do
bot.on('message', async (ctx) => {
  const message = ctx.message as Message
  const chatId = ctx.chat?.id
  const isCommand = isRegisteredCommandMessage(message, commandRegistry)

  if (isCommand || !chatId) {
    return
  }

  // Collect album photos when replying to a media group
  const extraMessages = await getMediaGroupMessages(ctx)
  await handleMessageWithAgent(message, extraMessages)
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
