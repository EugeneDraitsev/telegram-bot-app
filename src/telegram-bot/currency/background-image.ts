import {
  GEMINI_FLASH_LITE_IMAGE_MODEL,
  generateGeminiImage,
  getErrorMessage,
  logger,
} from '@tg-bot/common'
import {
  buildCurrencyBackgroundImagePrompt,
  fetchCurrencyBackgroundNews,
} from './background-news'
import type { CurrencyBackground } from './types'

const MAX_IMAGE_RETRIES = 2
const IMAGE_TIMEOUT_MS = 15_000

export async function getCurrencyBackgroundImage(): Promise<CurrencyBackground> {
  const news = await fetchCurrencyBackgroundNews()

  if (news.items.length === 0) {
    return {
      news,
      error: news.errors[0] ?? 'No relevant news found for the last 24 hours',
    }
  }

  const prompt = buildCurrencyBackgroundImagePrompt(news)
  let lastError: string | undefined

  for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {
    try {
      const response = await generateGeminiImage(prompt, undefined, {
        aspectRatio: '9:16',
        timeoutMs: IMAGE_TIMEOUT_MS,
      })

      if (response.image) {
        return {
          image: response.image,
          news,
          prompt,
        }
      }

      lastError = `${GEMINI_FLASH_LITE_IMAGE_MODEL.model} returned no image`
      logger.warn(
        { attempt, maxRetries: MAX_IMAGE_RETRIES },
        'currency.background_no_image',
      )
    } catch (error) {
      lastError = getErrorMessage(error)
      logger.warn(
        { attempt, maxRetries: MAX_IMAGE_RETRIES, error: lastError },
        'currency.background_image_failed',
      )
    }
  }

  return {
    news,
    prompt,
    error:
      lastError ?? `${GEMINI_FLASH_LITE_IMAGE_MODEL.model} returned no image`,
  }
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 3)}...`
}

export function buildCurrencyBackgroundDebugCaption(
  background: CurrencyBackground | undefined,
): string {
  if (!background) {
    return 'Currency background debug\nstatus: not requested'
  }

  const lines = [
    'Currency background debug',
    `status: ${background.image ? 'generated' : 'fallback gradient'}`,
    background.error ? `error: ${background.error}` : undefined,
    `news items: ${background.news.items.length}`,
  ].filter((line): line is string => Boolean(line))

  if (background.news.errors.length > 0) {
    lines.push(`news errors: ${background.news.errors.join('; ')}`)
  }

  const newsLines = background.news.items.slice(0, 5).map((item, index) => {
    return `${index + 1}. ${truncate(item.title, 88)} (${item.source})`
  })

  if (newsLines.length > 0) {
    lines.push('', ...newsLines)
  }

  return truncate(lines.join('\n'), 1_000)
}
