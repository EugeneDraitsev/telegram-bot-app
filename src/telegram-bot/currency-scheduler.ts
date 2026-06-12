import type { APIGatewayProxyHandler } from 'aws-lambda'

import { createBot, logger } from '@tg-bot/common'
import { getCurrencyMessages, sendCurrencyMessages } from './currency'

const CHAT_IDS = ['-1001306676509.0']

type SendCurrencyMessagesParams = Parameters<typeof sendCurrencyMessages>[0]

export async function sendScheduledCurrencyMessages({
  api,
  chatIds = CHAT_IDS,
  getMessages = getCurrencyMessages,
  sendMessages = sendCurrencyMessages,
}: {
  api: SendCurrencyMessagesParams['api']
  chatIds?: Array<number | string>
  getMessages?: typeof getCurrencyMessages
  sendMessages?: typeof sendCurrencyMessages
}) {
  const messages = await getMessages()

  for (const chatId of chatIds) {
    await sendMessages({
      api,
      chatId,
      messages,
    })
  }
}

const currencySchedulerHandler: APIGatewayProxyHandler = async () => {
  try {
    const bot = createBot()

    await sendScheduledCurrencyMessages({ api: bot.api })

    return { body: '', statusCode: 200 }
  } catch (e) {
    logger.error({ error: e }, 'currencySchedulerHandler error')
    return {
      body: JSON.stringify({ message: 'Something went wrong' }),
      // we need to send 200 here to avoid issue with telegram attempts to resend you a message
      statusCode: 200,
    }
  }
}

export default currencySchedulerHandler
