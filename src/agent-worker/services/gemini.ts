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
 * Generate image with optional text response.
 * Uses the Interactions API with gemini-3-pro-image-preview.
 */
export async function generateImage(
  prompt: string,
  inputImages?: Buffer[],
): Promise<{ image?: Buffer; text?: string }> {
  if (!apiKey) {
    throw new Error('Gemini API key not configured')
  }

  const input: Array<{
    role: 'user'
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'image'; data: string; mime_type: 'image/jpeg' }
    >
  }> = []

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

    logger.warn({ attempt, maxRetries: MAX_RETRIES }, 'image_gen.no_image')
  }

  if (result.text) {
    result.text = cleanResponse(result.text)
  }

  return result
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
