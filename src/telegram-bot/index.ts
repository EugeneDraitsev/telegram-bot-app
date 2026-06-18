import { webhookCallback } from 'grammy/web'
import type { APIGatewayProxyHandler } from 'aws-lambda'
import type { Message } from 'grammy/types'

import {
  createBot,
  invokeActivityLambda,
  logger,
  saveBotMessageMiddleware,
} from '@tg-bot/common'
import {
  type CommandRegistry,
  getRegisteredCommandName,
} from './command-registry'
import { setupAllCommands } from './setup-commands'

const bot = createBot()

bot.use(saveBotMessageMiddleware)

let commandRegistry: CommandRegistry = new Set<string>()

async function forwardActivity(message: Message, botUsername?: string) {
  const commandName = getRegisteredCommandName(
    message,
    commandRegistry,
    botUsername,
  )
  const command = commandName ? `/${commandName}` : ''

  await invokeActivityLambda({ message, command })
}

bot.use(async (ctx, next) => {
  const { chat } = ctx
  const message = ctx.message as Message | undefined
  if (!chat || !message) {
    await next()
    return
  }

  if (!chat.id) {
    logger.warn(
      { chatId: chat.id },
      'Skipping activity tracking: missing chat id',
    )
    await next()
    return
  }

  try {
    await Promise.all([
      forwardActivity(message, ctx.me?.username).catch((error) =>
        logger.error({ error }, 'Failed to invoke activity worker'),
      ),
      next(),
    ])
  } catch (error) {
    logger.error({ error }, 'Root error')
  }
})

// Setup all commands with deferred mode (async via Lambda)
commandRegistry = setupAllCommands(bot, true)

const handleUpdate = webhookCallback(bot, 'aws-lambda-async', {
  timeoutMilliseconds: 9_000,
})

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
    logger.error({ error: e }, 'Bot handler error')
    return {
      body: JSON.stringify({ message: 'Something went wrong' }),
      // we need to send 200 here to avoid issue with telegram attempts to resend you a message
      statusCode: 200,
    }
  }
}

export default telegramBotHandler
