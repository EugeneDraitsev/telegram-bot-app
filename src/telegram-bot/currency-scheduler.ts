import type { APIGatewayProxyHandler } from 'aws-lambda'

import { createBot } from '@tg-bot/common'
import { getCurrencyMessage } from './currency'

const bot = createBot()

const currencySchedulerHandler: APIGatewayProxyHandler = async () => {
  try {
    const CHAT_IDS = ['-1001306676509.0']

    const message = await getCurrencyMessage()

    for (const chatId of CHAT_IDS) {
      await bot.api.sendMessage(chatId, message, { parse_mode: 'HTML' })
    }

    return { body: '', statusCode: 200 }
  } catch (e) {
    console.error('currencySchedulerHandler error: ', e)
    return {
      body: JSON.stringify({ message: 'Something went wrong' }),
      // we need to send 200 here to avoid issue with telegram attempts to resend you a message
      statusCode: 200,
    }
  }
}

export default currencySchedulerHandler
