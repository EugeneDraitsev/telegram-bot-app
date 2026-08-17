import { generateText, type ModelMessage } from 'ai'

import {
  createAiSdkGoogleProvider,
  getAiSdkGoogleProvider,
  type MediaBuffer,
} from '@tg-bot/common'
import {
  adaptOmniInteractionRequest,
  extractLyriaInteractionOutput,
  getGoogleInteractionErrorMessage,
} from './google-interactions.adapter'

const GOOGLE_MEDIA_TIMEOUT_MS = 240_000

export const GEMINI_OMNI_FLASH_MODEL = 'gemini-omni-flash-preview'
export const LYRIA_3_CLIP_MODEL = 'lyria-3-clip-preview'
export const LYRIA_3_PRO_MODEL = 'lyria-3-pro-preview'

export type OmniAspectRatio = '9:16' | '16:9'
export type LyriaModel = typeof LYRIA_3_CLIP_MODEL | typeof LYRIA_3_PRO_MODEL

interface GeneratedMedia {
  buffer: Buffer
  mimeType: string
  interactionId?: string
}

export interface GeneratedMusic extends GeneratedMedia {
  text?: string
}

function getLyriaImages(media: MediaBuffer[] | undefined): MediaBuffer[] {
  return (media ?? []).filter((item) => item.mediaType === 'image').slice(0, 10)
}

function createPrompt(
  text: string,
  media: MediaBuffer[],
): string | ModelMessage[] {
  if (!media.length) return text

  return [
    {
      role: 'user',
      content: [
        ...media.map((item) => ({
          type: 'file' as const,
          data: item.buffer,
          mediaType: item.mimeType,
        })),
        { type: 'text', text },
      ],
    },
  ]
}

function getInteractionId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const google = (metadata as Record<string, unknown>).google
  if (!google || typeof google !== 'object') return undefined
  const interactionId = (google as Record<string, unknown>).interactionId
  return typeof interactionId === 'string' ? interactionId : undefined
}

function createOmniFetch(aspectRatio: OmniAspectRatio): typeof fetch {
  return async (input, init) => {
    if (typeof init?.body !== 'string') return fetch(input, init)

    try {
      const body = adaptOmniInteractionRequest(
        JSON.parse(init.body),
        aspectRatio,
      )
      return fetch(input, { ...init, body: JSON.stringify(body) })
    } catch {
      return fetch(input, init)
    }
  }
}

async function runGoogleInteraction<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw new Error(getGoogleInteractionErrorMessage(error), { cause: error })
  }
}

export async function generateOmniVideo(options: {
  prompt: string
  aspectRatio: OmniAspectRatio
  durationSeconds: number
  media?: MediaBuffer[]
}): Promise<GeneratedMedia> {
  const prompt = `${options.prompt.trim()}\n\nGenerate exactly ${options.durationSeconds} seconds of video in ${options.aspectRatio} aspect ratio.`
  const response = await runGoogleInteraction(() =>
    generateText({
      model: createAiSdkGoogleProvider({
        fetch: createOmniFetch(options.aspectRatio),
      }).interactions(GEMINI_OMNI_FLASH_MODEL),
      prompt: createPrompt(prompt, options.media ?? []),
      maxRetries: 0,
      timeout: GOOGLE_MEDIA_TIMEOUT_MS,
    }),
  )
  const video = response.files.find((file) =>
    file.mediaType.startsWith('video/'),
  )
  if (!video?.uint8Array.byteLength) {
    throw new Error('Gemini Omni returned no video output')
  }

  return {
    buffer: Buffer.from(video.uint8Array),
    mimeType: video.mediaType,
    interactionId: getInteractionId(response.providerMetadata),
  }
}

export async function generateLyriaMusic(options: {
  prompt: string
  model: LyriaModel
  media?: MediaBuffer[]
}): Promise<GeneratedMusic> {
  const images = getLyriaImages(options.media)
  const response = await runGoogleInteraction(() =>
    generateText({
      model: getAiSdkGoogleProvider().interactions(options.model),
      prompt: createPrompt(options.prompt.trim(), images),
      maxRetries: 0,
      timeout: GOOGLE_MEDIA_TIMEOUT_MS,
      include: { responseBody: true },
    }),
  )
  const output = extractLyriaInteractionOutput(response.response.body)
  if (!output) throw new Error('Lyria returned no audio output')

  return {
    buffer: output.buffer,
    mimeType: output.mimeType,
    interactionId:
      getInteractionId(response.providerMetadata) ?? output.interactionId,
    text: response.text.trim() || output.text,
  }
}
