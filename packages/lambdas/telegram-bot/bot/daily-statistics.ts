import axios from 'axios'
import { noop } from 'lodash'

import { invokeLambda } from '@tg-bot/common'

const FRONTEND_BASE_URL = 'https://telegram-bot-ui.vercel.app'

export const getDailyStatistics = async (
  replyId: number,
  chatId: string | number,
  chatName: string,
) => {
  // fetch ssr-render url without await to reduce coldstart
  axios(`${FRONTEND_BASE_URL}/chat/${chatId}`).catch(noop)

  const statisticsMessage = `${chatName} chat statistics:${FRONTEND_BASE_URL}/chat/${chatId}`

  const sharpResponse = await invokeLambda({
    FunctionName: `telegram-${process.env.stage}-sharp-statistics`,
    Payload: JSON.stringify({
      queryStringParameters: {
        chatId,
      },
    }),
  })

  if (sharpResponse.FunctionError) {
    return {
      image: null,
      message: statisticsMessage,
    }
  }

  return {
    image: sharpResponse.Payload?.toString() || null,
    message: statisticsMessage,
  }
}
