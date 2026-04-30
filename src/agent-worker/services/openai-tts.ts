/**
 * OpenAI Text-to-Speech Service
 */

import { getOpenAiClient } from './openai-client'

export const VOICE_MODEL = 'tts-1'

export async function generateVoice(
  text: string,
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
): Promise<Buffer> {
  const response = await getOpenAiClient().audio.speech.create({
    model: VOICE_MODEL,
    input: text.slice(0, 4096),
    voice,
    response_format: 'opus',
  })

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
