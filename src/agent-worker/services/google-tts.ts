/** Gemini speech and voice design, encoded as Ogg/Opus for Telegram. */

import {
  FFMPEG_TIMEOUT_MS,
  getErrorMessage,
  getGoogleApiKey,
  logger,
  runFfmpeg,
} from '@tg-bot/common'
import { trackToolModelCall } from '../tools/context'
import { extractInteractionAudio } from './google-interactions.adapter'

export const VOICE_MODEL = 'gemini-3.8-flash-tts'
export const DEFAULT_VOICE = 'Kore'
export const VOICES = [
  'Zephyr',
  'Puck',
  'Charon',
  'Kore',
  'Fenrir',
  'Leda',
  'Orus',
  'Aoede',
  'Callirrhoe',
  'Autonoe',
  'Enceladus',
  'Iapetus',
  'Umbriel',
  'Algieba',
  'Despina',
  'Erinome',
  'Algenib',
  'Rasalgethi',
  'Laomedeia',
  'Achernar',
  'Alnilam',
  'Schedar',
  'Gacrux',
  'Pulcherrima',
  'Achird',
  'Zubenelgenubi',
  'Vindemiatrix',
  'Sadachbia',
  'Sadaltager',
  'Sulafat',
] as const
const GOOGLE_API_URL = 'https://generativelanguage.googleapis.com/v1beta'
const VOICE_REQUEST_TIMEOUT_MS = 90_000
const VOICE_CLEANUP_TIMEOUT_MS = 10_000
export const VOICE_TOOL_TIMEOUT_MS =
  VOICE_REQUEST_TIMEOUT_MS * 2 +
  FFMPEG_TIMEOUT_MS +
  VOICE_CLEANUP_TIMEOUT_MS +
  5_000
const MAX_VOICE_AUDIO_BYTES = 9 * 1024 * 1024
const DESIGNED_VOICE_ID = /^voice_[a-zA-Z0-9_-]{1,80}$/

interface VoiceOptions {
  voice?: string
  style?: string
  voiceDescription?: string
}

async function requestGoogleVoice(
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  const apiKey = getGoogleApiKey()
  const response = await fetch(`${GOOGLE_API_URL}/${endpoint}`, {
    method: body ? 'POST' : 'DELETE',
    headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(
      body ? VOICE_REQUEST_TIMEOUT_MS : VOICE_CLEANUP_TIMEOUT_MS,
    ),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => null)
    const reason =
      typeof result?.error?.message === 'string'
        ? result.error.message.replaceAll(apiKey, '[redacted]').slice(0, 500)
        : 'Request rejected'
    throw new Error(
      `Google voice request failed (${response.status}): ${reason}`,
    )
  }
  return response
}

export async function generateVoice(
  text: string,
  options: VoiceOptions = {},
): Promise<Buffer> {
  const spokenText = text.trim()
  if (!spokenText) throw new Error('Text cannot be empty')
  if (spokenText.length > 4096)
    throw new Error('Voice text exceeds 4096 characters')
  let voice = options.voice?.trim() || DEFAULT_VOICE
  const description = options.voiceDescription?.trim().slice(0, 1000)
  if (
    !description &&
    !VOICES.some((item) => item === voice) &&
    !DESIGNED_VOICE_ID.test(voice)
  ) {
    throw new Error(`Unsupported voice: ${voice}`)
  }
  const style = options.style?.trim().slice(0, 500)
  let createdVoice: string | undefined

  try {
    if (description) {
      const result = await trackToolModelCall(
        { name: 'voice_design', model: `google/${VOICE_MODEL}` },
        async () =>
          (
            await requestGoogleVoice('voices', {
              store: true,
              voice: {
                model: VOICE_MODEL,
                type: 'prompted',
                display_name: 'Telegram one-off voice',
                prompted: { input: description },
              },
            })
          ).json(),
      )
      if (
        typeof result?.id !== 'string' ||
        !DESIGNED_VOICE_ID.test(result.id)
      ) {
        throw new Error('Google voice design returned no voice ID')
      }
      voice = createdVoice = result.id
    }

    const result = await trackToolModelCall(
      { name: 'voice_generation', model: `google/${VOICE_MODEL}` },
      async () =>
        (
          await requestGoogleVoice('interactions', {
            model: VOICE_MODEL,
            input: [
              {
                type: 'user_input',
                content: [
                  {
                    type: 'text',
                    text: spokenText,
                    ...(style
                      ? { annotations: [{ type: 'speech_metadata', style }] }
                      : {}),
                  },
                ],
              },
            ],
            response_format: { type: 'audio', mime_type: 'audio/wav' },
            generation_config: { speech_config: [{ voice }] },
            store: false,
          })
        ).json(),
    )
    if (result?.status !== 'completed') {
      throw new Error('Google voice generation did not complete')
    }
    const audio = extractInteractionAudio(result, 'audio/wav')
    if (!audio) throw new Error('Google returned no voice audio')
    if (audio.buffer.byteLength > MAX_VOICE_AUDIO_BYTES) {
      throw new Error('Google voice audio exceeds the byte limit')
    }
    if (audio.mimeType !== 'audio/wav') {
      throw new Error(`Unexpected Google voice format: ${audio.mimeType}`)
    }
    const opus = await runFfmpeg(
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-i',
        'pipe:0',
        '-c:a',
        'libopus',
        '-b:a',
        '48k',
        '-f',
        'ogg',
        'pipe:1',
      ],
      audio.buffer,
    )
    if (!opus.byteLength) throw new Error('ffmpeg produced empty voice audio')
    return opus
  } finally {
    // Delete only profiles created for this request, never a supplied reusable ID.
    if (createdVoice) {
      await requestGoogleVoice(`voices/${createdVoice}`).catch((error) => {
        logger.warn(
          { voice: createdVoice, error: getErrorMessage(error) },
          'voice_design.cleanup_failed',
        )
      })
    }
  }
}
