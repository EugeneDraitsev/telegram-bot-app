import { Bot, webhookCallback } from 'grammy'
import type { LambdaFunctionURLHandler } from 'aws-lambda'

import setupGoogleCommands from './google'

const bot = new Bot(process.env.TOKEN || '')

const handleUpdate = webhookCallback(bot, 'aws-lambda-async', {
  // 5 minutes timeout
  timeoutMilliseconds: 300_000,
})

// /g <text> - search random image in google search
// /t <text> - translate detected language to russian / english
// /tb <text> - translate detected language to belarusian
// /tp <text> - translate detected language to polish
// /ts <text> - translate detected language to swedish
// /td <text> - translate detected language to deutsch
// /tr <text> - translate detected language to russian
// /te <text> - translate detected language to english
// /v <text> -  search random video in YouTube
setupGoogleCommands(bot, { deferredCommands: false })

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
