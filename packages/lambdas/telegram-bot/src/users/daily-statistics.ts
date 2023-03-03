import { invokeLambda, safeJSONParse } from '@tg-bot/common'

const FRONTEND_BASE_URL = 'https://telegram-bot-ui.vercel.app'

export const getDailyStatistics = async (
  replyId: number,
  chatId: string | number,
  chatName: string,
) => {
  const statisticsMessage = `24h ${chatName} chat statistics: ${FRONTEND_BASE_URL}/chat/${chatId}`

  try {
    const sharpResponse = await invokeLambda({
      FunctionName: `telegram-${process.env.stage}-sharp-statistics`,
      Payload: Buffer.from(
        JSON.stringify({
          queryStringParameters: {
            chatId,
          },
        }),
      ),
    })

    if (sharpResponse.FunctionError) {
      return {
        image: null,
        message: statisticsMessage,
      }
    }

    const image = safeJSONParse(new TextDecoder().decode(sharpResponse.Payload)).body
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
