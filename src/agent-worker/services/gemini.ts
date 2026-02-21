/**
 * Google Gemini AI for text and image generation
 * Independent implementation for agent-worker
 */

import { GoogleGenAI } from '@google/genai'

import { logger } from '../logger'

const apiKey = process.env.GEMINI_API_KEY || ''
const ai = new GoogleGenAI({ apiKey })
const OPENAI_TTS_TIMEOUT_MS = 15_000

type WebSearchResponseFormat = 'brief' | 'detailed' | 'list'

/**
 * System instructions for the bot personality
 */
const SYSTEM_INSTRUCTIONS = `Ты - умный и весёлый бот-помощник в Telegram чате.
Отвечай кратко, по делу, с юмором когда уместно.
Используй emoji умеренно.
Отвечай на том языке, на котором к тебе обращаются (обычно русский).
Не используй markdown форматирование - только plain text.`

/**
 * Generate text completion with optional grounded search
 */
export async function generateText(
  prompt: string,
  useGroundedSearch = false,
  model = 'gemini-3-flash-preview',
): Promise<string> {
  if (!apiKey) {
    throw new Error('Gemini API key not configured')
  }

  const interaction = await ai.interactions.create({
    model,
    input: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    system_instruction: SYSTEM_INSTRUCTIONS,
    ...(useGroundedSearch ? { tools: [{ type: 'google_search' }] } : {}),
  })

  const textOutput = interaction.outputs?.find((o) => o.type === 'text')
  const text = textOutput?.text

  if (!text) {
    throw new Error('Empty response from Gemini')
  }

  return cleanResponse(text)
}

export async function searchWeb(
  query: string,
  format: WebSearchResponseFormat = 'brief',
): Promise<string> {
  const formatInstructions: Record<WebSearchResponseFormat, string> = {
    brief: 'Answer briefly in 1-2 sentences.',
    detailed: 'Answer in detail with concise context and key facts.',
    list: 'Answer as a concise bullet list.',
  }

  const prompt = [
    'Use fresh web information from Google Search.',
    `Query: ${query}`,
    formatInstructions[format],
  ].join('\n')

  return generateText(prompt, true)
}

/**
 * Generate image with optional text response
 */
export async function generateImage(
  prompt: string,
  inputImages?: Buffer[],
): Promise<{ image?: Buffer; text?: string }> {
  if (!apiKey) {
    throw new Error('Gemini API key not configured')
  }

  // Build input with optional images
  const input: Array<{
    role: 'user'
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mime_type: string }
    >
  }> = []

  // Add input images if provided (for editing)
  if (inputImages?.length) {
    for (const image of inputImages) {
      input.push({
        role: 'user',
        content: [
          {
            type: 'image',
            data: image.toString('base64'),
            mime_type: 'image/jpeg',
          },
        ],
      })
    }
  }

  // Add prompt
  input.push({
    role: 'user',
    content: [{ type: 'text', text: prompt }],
  })

  const MAX_RETRIES = 3
  let result: { image?: Buffer; text?: string } = {}

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const interaction = await ai.interactions.create({
      model: 'gemini-3-pro-image-preview',
      input,
      response_modalities: ['image', 'text'],
    })

    result =
      interaction.outputs?.reduce(
        (acc, output) => {
          if (output.type === 'text' && output.text) {
            acc.text = (acc.text || '') + output.text
          }
          if (output.type === 'image' && output.data) {
            acc.image = Buffer.from(output.data, 'base64')
          }
          return acc
        },
        {} as { image?: Buffer; text?: string },
      ) || {}

    if (result.image) {
      break
    }

    logger.warn(
      {
        attempt,
        maxRetries: MAX_RETRIES,
      },
      'Gemini image generation returned no image',
    )
  }

  if (result.text) {
    result.text = cleanResponse(result.text)
  }

  return result
}

/**
 * Generate voice audio using OpenAI TTS
 * Note: Using OpenAI because Gemini doesn't have native TTS
 */
export async function generateVoice(
  text: string,
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
): Promise<Buffer> {
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured')
  }

  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    signal: AbortSignal.timeout(OPENAI_TTS_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text.slice(0, 4096), // TTS limit
      voice,
      response_format: 'opus',
    }),
  })

  if (!response.ok) {
    throw new Error(`OpenAI TTS error: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Clean response text from markdown artifacts
 */
function cleanResponse(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/\*\*/g, '') // Remove bold
    .replace(/\*/g, '') // Remove italic
    .replace(/__/g, '') // Remove underline
    .replace(/`/g, '') // Remove inline code
    .replace(/#{1,6}\s/g, '') // Remove headers
    .trim()
}
