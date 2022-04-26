import axios from 'axios'
import { noop } from 'lodash'

import { invokeLambda, safeJSONParse } from '@tg-bot/common'

const FRONTEND_BASE_URL = 'https://telegram-bot-ui.vercel.app'

export const getDailyStatistics = async (
  replyId: number,
  chatId: string | number,
  chatName: string,
) => {
  // fetch ssr-render url without await to reduce coldstart
  const statisticsMessage = `24h ${chatName} chat statistics: ${FRONTEND_BASE_URL}/chat/${chatId}`

  try {
    axios(`${FRONTEND_BASE_URL}/chat/${chatId}`).catch(noop)
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

    const image = safeJSONParse(sharpResponse.Payload).body
    const imageBuffer = Buffer.from(image, 'base64')

    return {
      image: imageBuffer,
      message: statisticsMessage,
    }
  } catch (e) {
    return {
      image: null,
      message: statisticsMessage,
    }
  }
}
