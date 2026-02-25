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
import { isRegisteredCommandMessage } from './command-registry'
import { setupAllCommands } from './setup-commands'

const bot = createBot()

bot.use(saveBotMessageMiddleware)

let commandRegistry = new Set<string>()

async function trackActivity(message: Message, chat: Chat, caption?: string) {
  const command = isRegisteredCommandMessage(message, commandRegistry)
    ? findCommand(message.text || message.caption)
    : ''

  const tasks = [
    updateStatistics(message.from, chat),
    saveEvent(message.from, chat?.id, command, message.date),
  ]

  if (isAiEnabledChat(chat.id)) {
    tasks.push(
      saveMessage(
        { ...message, text: message.text || caption || '' },
        chat.id,
      ).catch((error) => console.error('saveHistory error: ', error)),
    )
  }

  await Promise.allSettled(tasks).catch((error) =>
    console.error('Tracking error: ', error),
  )
}

bot.use(async (ctx, next) => {
  const { chat } = ctx
  const message = ctx.message as Message
  // biome-ignore lint/suspicious/noExplicitAny: <>
  const caption: string = (ctx as any).caption
  console.log('ctx: ', JSON.stringify(ctx, null, 2))
  if (chat && message) {
    const chat = await ctx
      .getChat()
      .catch((error) => console.error('getChat error: ', error))

    try {
      await Promise.all([
        trackActivity(message, chat as Chat, caption),
        next?.(),
      ])
    } catch (error) {
      console.error('Root error: ', error)
    }
  }
})

// Setup all commands with deferred mode (async via Lambda)
commandRegistry = setupAllCommands(bot, true)

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
