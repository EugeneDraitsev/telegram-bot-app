import { getChatStatisticsUrl, logger, renderSharpImage } from '@tg-bot/common'

export const getDailyStatistics = async (
  chatId: string | number,
  chatName: string,
) => {
  const message = `24h ${chatName} chat statistics: ${getChatStatisticsUrl(chatId)}`

  try {
    const image = await renderSharpImage({
      queryStringParameters: { chatId },
    })
    return { image, message }
  } catch (error) {
    logger.warn({ chatId, error }, 'statistics.image_failed')
    return { image: null, message }
  }
}
