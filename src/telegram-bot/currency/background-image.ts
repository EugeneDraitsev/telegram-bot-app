import { generateImage as generateAiImage } from 'ai'

import {
  buildOpenAiImagePrompt,
  getAiSdkOpenAiImageModel,
  getAiSdkOpenAiImageSize,
  getErrorMessage,
  isOpenAiGptImageModel,
  logger,
  OPENAI_GPT_IMAGE_MODEL,
} from '@tg-bot/common'
import {
  buildCurrencyBackgroundImagePrompt,
  fetchCurrencyBackgroundNews,
} from './background-news'
import type { CurrencyBackground } from './types'

const MAX_IMAGE_RETRIES = 2

export async function getCurrencyBackgroundImage(): Promise<CurrencyBackground> {
  const news = await fetchCurrencyBackgroundNews()

  if (news.items.length === 0) {
    return {
      news,
      error: news.errors[0] ?? 'No relevant news found for the last 24 hours',
    }
  }

  const prompt = buildCurrencyBackgroundImagePrompt(news)
  const imagePrompt = buildOpenAiImagePrompt(prompt)
  const imageSize = getAiSdkOpenAiImageSize()
  const isGptImageModel = isOpenAiGptImageModel(OPENAI_GPT_IMAGE_MODEL)
  let lastError: string | undefined

  for (let attempt = 1; attempt <= MAX_IMAGE_RETRIES; attempt++) {
    try {
      const response = await generateAiImage({
        model: getAiSdkOpenAiImageModel(OPENAI_GPT_IMAGE_MODEL),
        prompt: imagePrompt,
        n: 1,
        ...(imageSize ? { size: imageSize } : {}),
        maxRetries: 0,
        providerOptions: {
          openai: {
            quality: isGptImageModel ? 'medium' : 'standard',
          },
        },
      })

      if (response.image?.uint8Array) {
        return {
          image: Buffer.from(response.image.uint8Array),
          news,
          prompt,
        }
      }

      lastError = 'OpenAI returned no image'
      logger.warn(
        { attempt, maxRetries: MAX_IMAGE_RETRIES, warnings: response.warnings },
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
    error: lastError ?? 'OpenAI returned no image',
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
