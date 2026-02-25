/**
 * OpenAI Text-to-Speech Service
 */

import OpenAi from 'openai'

let client: OpenAi | null = null

function getClient(): OpenAi {
  if (client) return client

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')

  client = new OpenAi({ apiKey })
  return client
}

export async function generateVoice(
  text: string,
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
): Promise<Buffer> {
  const response = await getClient().audio.speech.create({
    model: 'tts-1',
    input: text.slice(0, 4096),
    voice,
    response_format: 'opus',
  })

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
