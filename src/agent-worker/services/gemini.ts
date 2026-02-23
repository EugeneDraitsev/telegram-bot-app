/**
 * Google Gemini AI for image and voice generation.
 * Text generation for the main loop is now in agentic-loop.ts via @google/genai directly.
 * This file keeps specialized generation functions that tools still need.
 */

import { GoogleGenAI } from '@google/genai'

import { logger } from '../logger'

const apiKey = process.env.GEMINI_API_KEY || ''
const ai = new GoogleGenAI({ apiKey })

type WebSearchResponseFormat = 'brief' | 'detailed' | 'list'

/**
 * Search the web using grounded Google Search via gemini-2.0-flash.
 * Uses a faster model since it only needs to search + format — not think deeply.
 * The output is Telegram-ready markdown that can be sent directly.
 */
export async function searchWeb(
  query: string,
  format: WebSearchResponseFormat = 'brief',
): Promise<string> {
  const formatInstructions: Record<WebSearchResponseFormat, string> = {
    brief: 'Answer briefly in 1-2 sentences.',
    detailed:
      'Answer concisely with key facts. Use markdown formatting (bold for key numbers, bullet points for lists). Keep it under 500 characters — this is a Telegram chat.',
    list: 'Answer as a concise bullet list.',
  }

  const prompt = [
    'Use fresh web information from Google Search.',
    `Query: ${query}`,
    formatInstructions[format],
    'Answer in the same language as the query.',
  ].join('\n')

  if (!apiKey) {
    throw new Error('Gemini API key not configured')
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  })

  const text = response.text
  if (!text) {
    throw new Error('Empty response from Gemini')
  }

  return cleanResponse(text)
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

const OPENAI_TTS_TIMEOUT_MS = 15_000

/**
 * Generate voice audio using OpenAI TTS
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
      input: text.slice(0, 4096),
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
