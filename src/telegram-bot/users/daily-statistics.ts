import { invokeLambda, safeJSONParse } from '@tg-bot/common'

const FRONTEND_BASE_URL = 'https://telegram-bot-ui.vercel.app'
const SHARP_LAMBDA_NAME = `telegram-${process.env.stage}-sharp-statistics`

export const getDailyStatistics = async (
  chatId: string | number,
  chatName: string,
) => {
  const statisticsMessage = `24h ${chatName} chat statistics: ${FRONTEND_BASE_URL}/chat/${chatId}`

  try {
    const sharpResponse = await invokeLambda({
      name: SHARP_LAMBDA_NAME,
      payload: { queryStringParameters: { chatId } },
    })

    if (sharpResponse.FunctionError) {
      return {
        image: null,
        message: statisticsMessage,
      }
    }

    const image = safeJSONParse(
      new TextDecoder().decode(sharpResponse.Payload),
    ).body
    const imageBuffer = Buffer.from(image, 'base64')
    return {
      image: imageBuffer,
      message: statisticsMessage,
    }
  } catch (_e) {
    return {
      image: null,
      message: statisticsMessage,
    }
  }
}
