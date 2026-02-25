/**
 * OpenAI Image Generation & Editing Service
 *
 * Change IMAGE_MODEL to switch the underlying model.
 */

import OpenAi from 'openai'
import { toFile, type Uploadable } from 'openai/uploads'
import type { ImageModel } from 'openai/resources'

import { logger } from '../logger'

/** Model used by the generate_or_edit_image agent tool */
export const IMAGE_MODEL: ImageModel = 'gpt-image-1.5'

const MAX_RETRIES = 3

let client: OpenAi | null = null

function getClient(): OpenAi {
  if (client) return client

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  client = new OpenAi({ apiKey })
  return client
}

export async function generateImageOpenAi(
  prompt: string,
  inputImages?: Buffer[],
): Promise<{ image?: Buffer; text?: string }> {
  const openAi = getClient()

  const requestImage = async (): Promise<OpenAi.Images.ImagesResponse> => {
    if (inputImages?.length && IMAGE_MODEL === 'gpt-image-1.5') {
      const images: Uploadable[] = []
      for (const buf of inputImages) {
        images.push(await toFile(buf, 'image.jpg', { type: 'image/jpeg' }))
      }

      return openAi.images.edit({
        prompt,
        model: IMAGE_MODEL,
        image: images,
        quality: 'medium',
        n: 1,
        size: '1024x1024',
      })
    }

    return openAi.images.generate({
      prompt,
      model: IMAGE_MODEL,
      quality: IMAGE_MODEL === 'gpt-image-1.5' ? 'medium' : 'standard',
      n: 1,
      size: '1024x1024',
    })
  }

  let lastError: Error | undefined

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await requestImage()
      const data = response.data?.[0]

      if (data?.b64_json) {
        return {
          image: Buffer.from(data.b64_json, 'base64'),
          text: data.revised_prompt,
        }
      }

      logger.warn({ attempt, maxRetries: MAX_RETRIES }, 'openai_image.no_image')
    } catch (error) {
      lastError = error as Error
      logger.warn(
        { attempt, maxRetries: MAX_RETRIES, error: (error as Error).message },
        'openai_image.attempt_failed',
      )
    }
  }

  if (lastError) {
    throw lastError
  }

  return {}
}
