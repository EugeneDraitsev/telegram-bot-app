import '@tg-bot/dynamo-optimization'

import sharp from 'sharp'
import { APIGatewayProxyHandler } from 'aws-lambda'
import { get24hChatStats, sanitizeSvg } from '@tg-bot/common'

import { getDailyUsersBarsSvg } from './charts/daily-users-bars.component'

const sharpStatisticsHandler: APIGatewayProxyHandler = async (event) => {
  const chatId = event.queryStringParameters?.chatId || ''
  const chatData = await get24hChatStats(chatId)
  const html = getDailyUsersBarsSvg(chatData)
  const svg = sanitizeSvg(html)

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Content-Disposition': 'inline; filename=chart.svg',
    },
    body: sharp(Buffer.from(svg))
      .resize(1200, 400)
      .flatten({ background: '#fff' })
      .png()
      .toBuffer()
      .toString(),
  }
}

export default sharpStatisticsHandler
