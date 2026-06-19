import sharp from 'sharp'
import type { APIGatewayProxyHandler } from 'aws-lambda'

import { type CurrencyRateSection, get24hChatStats } from '@tg-bot/common'
import { getCurrencyRatesSvg } from './currency-rates.component'
import { getDailyUsersBarsSvg } from './daily-users-bars.component'

type CurrencyRatesEvent = {
  currencySections?: CurrencyRateSection[]
}

async function renderPng(
  svg: string,
  resize?: { width: number; height: number },
) {
  let pipeline = sharp(Buffer.from(svg))
  if (resize) {
    pipeline = pipeline.resize(resize.width, resize.height)
  }

  return pipeline.flatten({ background: '#fff' }).png().toBuffer()
}

function pngResponse(image: Buffer) {
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'image/png' },
    isBase64Encoded: true,
    body: image.toString('base64'),
  }
}

const sharpRendererHandler: APIGatewayProxyHandler = async (event) => {
  const currencySections = (event as CurrencyRatesEvent).currencySections

  if (Array.isArray(currencySections)) {
    const svg = getCurrencyRatesSvg(currencySections)
    const image = await renderPng(svg)

    return pngResponse(image)
  }

  const chatId =
    event.queryStringParameters?.chatId || event.pathParameters?.chatId || ''
  const chatData = await get24hChatStats(chatId)
  const svg = getDailyUsersBarsSvg(chatData)

  const image = await renderPng(svg, { width: 1200, height: 400 })

  return pngResponse(image)
}

export default sharpRendererHandler
