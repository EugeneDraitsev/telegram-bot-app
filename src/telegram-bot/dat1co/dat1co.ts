import {
  DEFAULT_ERROR_MESSAGE,
  isAiEnabledChat,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
} from '../utils'

const DAT1CO_URL = 'https://api.dat1.co/api/v1/collection/qwen-image/invoke'

const apiKey = process.env.DAT1CO_API_KEY || ''

type Dat1coOptions = {
  neg_prompt?: string
  true_cfg_scale?: number
  num_inference_steps?: number
  aspect_ratio?: string
  seed?: number
}

export async function generateImageDat1co(
  prompt: string,
  chatId: string | number,
  options: Dat1coOptions = {},
) {
  if (!isAiEnabledChat(chatId)) {
    throw new Error(NOT_ALLOWED_ERROR)
  }
  if (!prompt) {
    throw new Error(PROMPT_MISSING_ERROR)
  }

  if (!apiKey) {
    throw new Error('DAT1CO_API_KEY is not set')
  }

  try {
    const body = {
      input: {
        prompt,
        neg_prompt: options.neg_prompt ?? '',
        true_cfg_scale: options.true_cfg_scale ?? 4.0,
        num_inference_steps: options.num_inference_steps ?? 50,
        aspect_ratio: options.aspect_ratio ?? '1:1',
        seed: options.seed ?? Math.floor(Math.random() * 1000000000),
      },
    }

    const res = await fetch(DAT1CO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text)
    }

    const data = await res.json()
    return Buffer.from(data.response, 'base64')
  } catch (e) {
    console.error('Error generating image with dat1co: ', e)
    return DEFAULT_ERROR_MESSAGE
  }
}
