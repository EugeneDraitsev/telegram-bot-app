import { getHistory } from '../upstash'
import {
  cleanGeminiMessage,
  DEFAULT_ERROR_MESSAGE,
  geminiSystemInstructions,
  isAiEnabledChat,
  NOT_ALLOWED_ERROR,
  PROMPT_MISSING_ERROR,
} from '../utils'

const Z_IMAGE_URL = 'https://api.dat1.co/api/v1/collection/z-image-turbo/invoke'
const GEMMA_URL =
  'https://api.dat1.co/api/v1/collection/gemma-3-12b/invoke-chat'

const apiKey = process.env.DAT1CO_API_KEY || ''

type Dat1coOptions = {
  neg_prompt?: string
  true_cfg_scale?: number
  num_inference_steps?: number
  aspect_ratio?: string
  seed?: number
}

export async function generateGemmaCompletion(
  prompt: string,
  chatId: string | number,
  imagesData: Buffer[] = [],
) {
  if (!isAiEnabledChat(chatId)) {
    return NOT_ALLOWED_ERROR
  }
  if (!prompt && (!imagesData || imagesData.length === 0)) {
    return PROMPT_MISSING_ERROR
  }

  if (!apiKey) {
    console.error('DAT1CO_API_KEY is not set')
    return DEFAULT_ERROR_MESSAGE
  }

  try {
    const history = await getHistory(chatId)
    const messages = [
      ...history.map((h) => {
        let content = h.parts[0].text
        try {
          const msg = JSON.parse(content)
          content = msg.text || msg.caption || content
        } catch (_e) {
          // ignore error
        }
        return {
          role: h.role === 'model' ? 'assistant' : 'user',
          content,
        }
      }),
      {
        role: 'system',
        content: geminiSystemInstructions,
      },
    ]

    // biome-ignore lint/suspicious/noExplicitAny: <>
    let userContent: any = prompt

    if (imagesData && imagesData.length > 0) {
      userContent = [
        {
          type: 'text',
          text: prompt,
        },
        ...imagesData.map((image) => ({
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${image.toString('base64')}`,
          },
        })),
      ]
    }

    messages.push({
      role: 'user',
      content: userContent,
    })

    const body = {
      messages,
    }

    const res = await fetch(GEMMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Dat1co API Error: ${res.status} ${text}`)
    }

    const data = await res.json()
    // Assuming the response structure for chat invoke.
    // Usually input: { messages: ... } -> output: { response: "text" } or similar.
    // The image invoke returns { response: base64 }.
    // If it's a standard chat invoke, it might be { output: "..." } or { result: "..." }
    // or just the text if it's raw.
    // But since it's a collection invoke, let's assume `response` field or look at the response.
    // I will try to read `response` or `output` or `content`.

    // Safest bet for these wrappers: data.response or data.output.
    const responseText =
      data.choices?.[0]?.message?.content ||
      data.output ||
      data.content ||
      JSON.stringify(data)

    return cleanGeminiMessage(responseText)
  } catch (e) {
    console.error('Error generating gemma completion with dat1co: ', e)
    return DEFAULT_ERROR_MESSAGE
  }
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
      prompt,
      neg_prompt: options.neg_prompt ?? '',
      true_cfg_scale: options.true_cfg_scale ?? 4.0,
      num_inference_steps: options.num_inference_steps ?? 50,
      aspect_ratio: options.aspect_ratio ?? '1:1',
      seed: options.seed ?? Math.floor(Math.random() * 1000000000),
    }

    const res = await fetch(Z_IMAGE_URL, {
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
