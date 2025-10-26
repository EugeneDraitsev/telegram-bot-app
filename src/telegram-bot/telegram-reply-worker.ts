import { Bot, webhookCallback } from 'grammy'
import type { LambdaFunctionURLHandler } from 'aws-lambda'

import setupDat1coCommands from './dat1co'
import setupGoogleCommands from './google'
import setupOpenAiCommands from './open-ai'
import { saveBotMessageMiddleware } from './utils'

const bot = new Bot(process.env.TOKEN || '', {
  client: {
    // biome-ignore lint/suspicious/noExplicitAny: <Grammy fetch typing is incorrect>
    fetch: globalThis.fetch as any,
  },
})

bot.use(saveBotMessageMiddleware)

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
// /v <text> - search random video in YouTube
setupGoogleCommands(bot, { deferredCommands: false })

// /q <text | image-with-caption> - generate chat completion with 4o
// /e <text> - generate image
// /o <text> - generate chat completion with o3-mini
setupOpenAiCommands(bot, { deferredCommands: false })

// /de <text> - generate image with dat1co
setupDat1coCommands(bot, { deferredCommands: false })

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
