/**
 * OpenAI Text-to-Speech Service
 */

import { experimental_generateSpeech as generateSpeech } from 'ai'

import { getAiSdkOpenAiSpeechModel } from '@tg-bot/common'

export const VOICE_MODEL = 'tts-1'

export async function generateVoice(
  text: string,
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
): Promise<Buffer> {
  const response = await generateSpeech({
    model: getAiSdkOpenAiSpeechModel(VOICE_MODEL),
    text: text.slice(0, 4096),
    voice,
    outputFormat: 'opus',
    maxRetries: 0,
  })

  return Buffer.from(response.audio.uint8Array)
}
