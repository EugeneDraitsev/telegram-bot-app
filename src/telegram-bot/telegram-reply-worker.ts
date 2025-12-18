import { webhookCallback } from 'grammy/web'
import type { LambdaFunctionURLHandler } from 'aws-lambda'

import { setupAllCommands } from './setup-commands'
import { createBot, saveBotMessageMiddleware } from './utils'

const bot = createBot()

bot.use(saveBotMessageMiddleware)

// Setup all commands with sync mode (no Lambda deferral)
setupAllCommands(bot, false)

const handleUpdate = webhookCallback(bot, 'aws-lambda-async', {
  // 5 minutes timeout
  timeoutMilliseconds: 300_000,
})

const telegramReplyWorker: LambdaFunctionURLHandler = async (
  event,
  context,
) => {
  try {
    await handleUpdate({ body: JSON.stringify(event), headers: {} }, context)
    return {
      statusCode: 200,
      body: JSON.stringify({ body: event.body ?? '' }),
    }
  } catch (e) {
    console.error('telegramReplyWorker error: ', e)
    return {
      body: JSON.stringify({ message: 'Something went wrong' }),
      // we need to send 200 here to avoid issue with telegram attempts to resend you a message
      statusCode: 200,
    }
  }
}

export default telegramReplyWorker
