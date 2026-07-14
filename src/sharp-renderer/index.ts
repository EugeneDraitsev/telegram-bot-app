import sharp from 'sharp'
import type { APIGatewayProxyHandler } from 'aws-lambda'

import { type CurrencyRateSection, get24hChatStats } from '@tg-bot/common'
import { getCurrencyRatesSvg } from './currency-rates.component'
import { getDailyUsersBarsSvg } from './daily-users-bars.component'

type CurrencyRatesEvent = {
  currencyBackgroundImage?: string
  currencySections?: CurrencyRateSection[]
}

type SvgRenderEvent = {
  svg?: unknown
  width?: unknown
  height?: unknown
  backgroundColor?: unknown
}

type RenderPngOptions = {
  resize?: { width?: number; height?: number }
  backgroundColor?: string
  allowDataResources?: boolean
  maxSvgBytes?: number
}

const MAX_SVG_BYTES = 250_000
const MAX_CURRENCY_SVG_BYTES = 6_000_000
const MAX_RENDER_DIMENSION = 2_000
const DEFAULT_BACKGROUND_COLOR = '#ffffff'
const TRANSPARENT_BACKGROUND = 'transparent'

function normalizeRenderDimension(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.max(1, Math.min(MAX_RENDER_DIMENSION, Math.round(value)))
}

function normalizeBackgroundColor(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_BACKGROUND_COLOR
  }

  const normalized = value.trim()
  if (normalized === TRANSPARENT_BACKGROUND) {
    return normalized
  }

  return /^#[0-9a-f]{3,8}$/i.test(normalized)
    ? normalized
    : DEFAULT_BACKGROUND_COLOR
}

function validateSvg(
  svg: string,
  allowDataResources = false,
  maxSvgBytes = MAX_SVG_BYTES,
): string {
  const normalized = svg.trim()
  if (!normalized) {
    throw new Error('SVG cannot be empty')
  }

  if (Buffer.byteLength(normalized, 'utf8') > maxSvgBytes) {
    throw new Error(`SVG exceeds ${maxSvgBytes} bytes`)
  }

  if (!/<svg[\s>]/i.test(normalized)) {
    throw new Error('SVG markup must contain an <svg> element')
  }

  if (
    /<!doctype|<!entity|<script\b|<foreignObject\b|<iframe\b|<object\b/i.test(
      normalized,
    )
  ) {
    throw new Error('SVG contains unsupported active content')
  }

  if (
    /(?:href|src)\s*=\s*["']\s*(?:https?:|file:)/i.test(normalized) ||
    /url\(\s*["']?\s*(?:https?:|file:)/i.test(normalized)
  ) {
    throw new Error('SVG must not reference external resources')
  }

  if (
    !allowDataResources &&
    (/(?:href|src)\s*=\s*["']\s*data:/i.test(normalized) ||
      /url\(\s*["']?\s*data:/i.test(normalized))
  ) {
    throw new Error('SVG must not embed data resources')
  }

  return normalized
}

export async function renderSvgPng(
  svg: string,
  options: RenderPngOptions = {},
) {
  const safeSvg = validateSvg(
    svg,
    options.allowDataResources,
    options.maxSvgBytes,
  )
  let pipeline = sharp(Buffer.from(safeSvg))
  if (options.resize?.width || options.resize?.height) {
    pipeline = pipeline.resize(options.resize.width, options.resize.height, {
      fit: 'inside',
      withoutEnlargement: false,
    })
  }

  if (options.backgroundColor !== TRANSPARENT_BACKGROUND) {
    pipeline = pipeline.flatten({
      background: options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    })
  }

  return pipeline.png().toBuffer()
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
  const svgPayload = (event as SvgRenderEvent).svg
  if (typeof svgPayload === 'string') {
    try {
      const image = await renderSvgPng(svgPayload, {
        resize: {
          width: normalizeRenderDimension((event as SvgRenderEvent).width),
          height: normalizeRenderDimension((event as SvgRenderEvent).height),
        },
        backgroundColor: normalizeBackgroundColor(
          (event as SvgRenderEvent).backgroundColor,
        ),
      })

      return pngResponse(image)
    } catch (error) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }),
      }
    }
  }

  const currencySections = (event as CurrencyRatesEvent).currencySections
  const currencyBackgroundImage = (event as CurrencyRatesEvent)
    .currencyBackgroundImage

  if (Array.isArray(currencySections)) {
    const svg = getCurrencyRatesSvg(
      currencySections,
      typeof currencyBackgroundImage === 'string'
        ? currencyBackgroundImage
        : undefined,
    )
    const image = await renderSvgPng(svg, {
      allowDataResources: true,
      maxSvgBytes: MAX_CURRENCY_SVG_BYTES,
    })

    return pngResponse(image)
  }

  const chatId =
    event.queryStringParameters?.chatId || event.pathParameters?.chatId || ''
  const chatData = await get24hChatStats(chatId)
  const statsSvg = getDailyUsersBarsSvg(chatData)

  const image = await renderSvgPng(statsSvg, {
    resize: { width: 1200, height: 400 },
  })

  return pngResponse(image)
}

export default sharpRendererHandler
