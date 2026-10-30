import { createBot } from '@tg-bot/common'
import {
  getCurrencyMessages,
  SCHEDULED_CURRENCY_MESSAGE_OPTIONS,
  sendCurrencyMessages,
} from './currency'

const CHAT_IDS = ['-1001306676509.0']

type SendCurrencyMessagesParams = Parameters<typeof sendCurrencyMessages>[0]
type GetCurrencyMessages = typeof getCurrencyMessages

export async function sendScheduledCurrencyMessages({
  api,
  chatIds = CHAT_IDS,
  getMessages = getCurrencyMessages,
  sendMessages = sendCurrencyMessages,
}: {
  api: SendCurrencyMessagesParams['api']
  chatIds?: Array<number | string>
  getMessages?: GetCurrencyMessages
  sendMessages?: typeof sendCurrencyMessages
}) {
  const messages = await getMessages(SCHEDULED_CURRENCY_MESSAGE_OPTIONS)

  for (const chatId of chatIds) {
    await sendMessages({
      api,
      chatId,
      messages,
    })
  }
}

// Failures throw: maximumRetryAttempts is 0, so nothing posts twice, and the
// currency-scheduler-failure alarm watches the function's Errors metric.
const currencySchedulerHandler = async () => {
  await sendScheduledCurrencyMessages({ api: createBot().api })
}

export default currencySchedulerHandler
