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

const GOOGLE_MEDIA_REQUEST_TIMEOUT_MS = 160_000
const MAX_INLINE_MEDIA_BYTES = 19 * 1024 * 1024
const MAX_OMNI_MEDIA_ITEMS = 4
const MAX_LYRIA_IMAGES = 10

export const GOOGLE_MEDIA_TOOL_TIMEOUT_MS = 170_000

export const GEMINI_OMNI_FLASH_MODEL = 'gemini-omni-flash-preview'
export const LYRIA_3_CLIP_MODEL = 'lyria-3-clip-preview'
export const LYRIA_3_PRO_MODEL = 'lyria-3-pro-preview'

export type OmniAspectRatio = '9:16' | '16:9'
export type LyriaModel = typeof LYRIA_3_CLIP_MODEL | typeof LYRIA_3_PRO_MODEL

interface GeneratedMedia {
  buffer: Buffer
  mimeType: string
  interactionId?: string
  outputTokensByModality?: Record<string, number>
}

export interface GeneratedMusic extends GeneratedMedia {
  text?: string
}

function selectInlineMedia(
  media: MediaBuffer[] | undefined,
  maxItems: number,
  supports: (item: MediaBuffer) => boolean,
): MediaBuffer[] {
  const selected: MediaBuffer[] = []
  let totalBytes = 0

  for (const item of media ?? []) {
    if (!supports(item)) continue
    if (selected.length >= maxItems) break
    if (totalBytes + item.buffer.byteLength > MAX_INLINE_MEDIA_BYTES) continue

    selected.push(item)
    totalBytes += item.buffer.byteLength
  }

  return selected
}

function getLyriaImages(media: MediaBuffer[] | undefined): MediaBuffer[] {
  return selectInlineMedia(
    media,
    MAX_LYRIA_IMAGES,
    (item) => item.mediaType === 'image',
  )
}

function getOmniMedia(media: MediaBuffer[] | undefined): MediaBuffer[] {
  return selectInlineMedia(
    media,
    MAX_OMNI_MEDIA_ITEMS,
    (item) => item.mediaType === 'image' || item.mediaType === 'video',
  )
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

function getOutputTokensByModality(
  metadata: unknown,
): Record<string, number> | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined
  const google = (metadata as Record<string, unknown>).google
  if (!google || typeof google !== 'object') return undefined
  const raw = (google as Record<string, unknown>).outputTokensByModality
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined

  const entries = Object.entries(raw).filter(
    (entry): entry is [string, number] =>
      typeof entry[1] === 'number' &&
      Number.isFinite(entry[1]) &&
      entry[1] >= 0,
  )
  return entries.length ? Object.fromEntries(entries) : undefined
}

function createOmniFetch(
  aspectRatio: OmniAspectRatio,
  durationSeconds: number,
): typeof fetch {
  // TODO: Remove this adapter when @ai-sdk/google supports video responseFormat.
  return async (input, init) => {
    if (typeof init?.body !== 'string') return fetch(input, init)

    try {
      const body = adaptOmniInteractionRequest(
        JSON.parse(init.body),
        aspectRatio,
        durationSeconds,
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
  const media = getOmniMedia(options.media)
  const response = await runGoogleInteraction(() =>
    generateText({
      model: createAiSdkGoogleProvider({
        fetch: createOmniFetch(options.aspectRatio, options.durationSeconds),
      }).interactions(GEMINI_OMNI_FLASH_MODEL),
      prompt: createPrompt(options.prompt.trim(), media),
      maxRetries: 0,
      timeout: GOOGLE_MEDIA_REQUEST_TIMEOUT_MS,
      providerOptions: {
        google: { store: false, responseModalities: ['video'] },
      },
    }),
  )
  const video = response.files.find((file) =>
    file.mediaType.startsWith('video/'),
  )
  if (!video?.uint8Array.byteLength) {
    throw new Error('Gemini Omni returned no video output')
  }
  const outputTokensByModality = getOutputTokensByModality(
    response.providerMetadata,
  )

  return {
    buffer: Buffer.from(video.uint8Array),
    mimeType: video.mediaType,
    interactionId: getInteractionId(response.providerMetadata),
    ...(outputTokensByModality ? { outputTokensByModality } : {}),
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
      timeout: GOOGLE_MEDIA_REQUEST_TIMEOUT_MS,
      include: { responseBody: true },
      providerOptions: {
        google: { store: false, responseModalities: ['audio'] },
      },
    }),
  )
  const output = extractLyriaInteractionOutput(response.response.body)
  if (!output) throw new Error('Lyria returned no audio output')
  const outputTokensByModality = getOutputTokensByModality(
    response.providerMetadata,
  )

  return {
    buffer: output.buffer,
    mimeType: output.mimeType,
    interactionId:
      getInteractionId(response.providerMetadata) ?? output.interactionId,
    ...(outputTokensByModality ? { outputTokensByModality } : {}),
    text: response.text.trim() || output.text,
  }
}
