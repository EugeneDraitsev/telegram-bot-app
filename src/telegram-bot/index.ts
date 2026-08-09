import { webhookCallback } from 'grammy/web'
import type { APIGatewayProxyHandler } from 'aws-lambda'
import type { Message } from 'grammy/types'

import { createBot, enqueueActivityWorker, logger } from '@tg-bot/common'
import {
  type CommandRegistry,
  getRegisteredCommandName,
} from './command-registry'
import {
  respondToWebhookDispatch,
  waitForIngressDispatch,
} from './ingress-dispatch'
import { setupAllCommands } from './setup-commands'
import { hasValidTelegramWebhookSecret } from './webhook-auth'

const bot = createBot()

let commandRegistry: CommandRegistry = new Set<string>()

async function forwardActivity(message: Message, botUsername?: string) {
  const commandName = getRegisteredCommandName(
    message,
    commandRegistry,
    botUsername,
  )
  const command = commandName ? `/${commandName}` : ''

  await enqueueActivityWorker({ message, command })
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

  await waitForIngressDispatch([
    forwardActivity(message, ctx.me?.username),
    next(),
  ])
})

// Setup all commands with deferred mode (durable SQS jobs)
commandRegistry = setupAllCommands(bot, true)

const handleUpdate = webhookCallback(bot, 'aws-lambda-async', {
  timeoutMilliseconds: 9_000,
})

const telegramBotHandler: APIGatewayProxyHandler = async (event, context) => {
  if (
    !hasValidTelegramWebhookSecret(
      event.headers,
      process.env.TELEGRAM_WEBHOOK_SECRET,
    )
  ) {
    logger.warn({ requestId: context.awsRequestId }, 'webhook.unauthorized')
    return { statusCode: 403, body: '' }
  }

  return respondToWebhookDispatch(
    () =>
      handleUpdate({ body: event.body ?? '', headers: event.headers }, context),
    (error) => logger.error({ error }, 'Bot handler error'),
  )
}

export default telegramBotHandler
