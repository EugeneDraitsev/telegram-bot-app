import {
  generateText,
  experimental_generateVideo as generateVideo,
  type ModelMessage,
} from 'ai'

import {
  getAiSdkGoogleProvider,
  getErrorMessage,
  logger,
  type MediaBuffer,
} from '@tg-bot/common'
import { extractLyriaInteractionOutput } from './google-interactions.adapter'

const GOOGLE_MEDIA_REQUEST_TIMEOUT_MS = 160_000
const GOOGLE_MEDIA_DOWNLOAD_ORIGIN = 'https://generativelanguage.googleapis.com'
const GOOGLE_MEDIA_DOWNLOAD_MAX_BYTES = 100 * 1024 * 1024
// Inline media is base64-encoded in JSON (~4/3 expansion). Keep raw inputs at
// 14 MiB so the encoded media plus request metadata stays below 20 MB.
const MAX_INLINE_MEDIA_RAW_BYTES = 14 * 1024 * 1024
const MAX_VEO_IMAGES = 1
const MAX_LYRIA_IMAGES = 10

export const GOOGLE_MEDIA_TOOL_TIMEOUT_MS = 170_000

export const VEO_3_1_LITE_MODEL = 'veo-3.1-lite-generate-preview'
export const LYRIA_3_CLIP_MODEL = 'lyria-3-clip-preview'
export const LYRIA_3_PRO_MODEL = 'lyria-3-pro-preview'

export type VeoAspectRatio = '9:16' | '16:9'
export type LyriaModel = typeof LYRIA_3_CLIP_MODEL | typeof LYRIA_3_PRO_MODEL

interface GeneratedMedia {
  buffer: Buffer
  mimeType: string
}

interface GeneratedMusic extends GeneratedMedia {
  text?: string
}

function prepareInlineMedia(
  media: MediaBuffer[] | undefined,
  explicit: boolean,
  maxItems: number,
  supports: (item: MediaBuffer) => boolean,
  modelLabel: string,
): MediaBuffer[] {
  const selected = media ?? []
  const unsupported = selected.find((item) => !supports(item))
  if (explicit && unsupported) {
    throw new Error(
      `${modelLabel} does not support selected ${unsupported.mediaType} media`,
    )
  }
  const supported = selected.filter(supports)

  if (explicit && supported.length > maxItems) {
    throw new Error(
      `${modelLabel} accepts at most ${maxItems} selected media items`,
    )
  }

  const totalBytes = supported.reduce(
    (total, item) => total + item.buffer.byteLength,
    0,
  )
  if (explicit && totalBytes > MAX_INLINE_MEDIA_RAW_BYTES) {
    throw new Error(
      `${modelLabel} selected media exceeds the 14 MiB raw inline limit`,
    )
  }

  if (explicit) return supported

  const bounded: MediaBuffer[] = []
  let boundedBytes = 0
  for (let index = supported.length - 1; index >= 0; index -= 1) {
    if (bounded.length >= maxItems) break
    const item = supported[index]
    if (!item) continue
    if (boundedBytes + item.buffer.byteLength > MAX_INLINE_MEDIA_RAW_BYTES) {
      continue
    }

    bounded.unshift(item)
    boundedBytes += item.buffer.byteLength
  }
  return bounded
}

export function prepareLyriaMedia(
  media: MediaBuffer[] | undefined,
  explicit: boolean,
): MediaBuffer[] {
  return prepareInlineMedia(
    media,
    explicit,
    MAX_LYRIA_IMAGES,
    (item) => item.mediaType === 'image',
    'Lyria',
  )
}

export function prepareVeoMedia(
  media: MediaBuffer[] | undefined,
  explicit: boolean,
): MediaBuffer[] {
  return prepareInlineMedia(
    media,
    explicit,
    MAX_VEO_IMAGES,
    (item) => item.mediaType === 'image',
    'Veo 3.1 Lite',
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

async function downloadGoogleMedia({
  url,
  abortSignal,
}: {
  url: URL
  abortSignal?: AbortSignal
}): Promise<{ data: Uint8Array; mediaType: string | undefined }> {
  if (
    url.origin !== GOOGLE_MEDIA_DOWNLOAD_ORIGIN ||
    !url.pathname.startsWith('/v1beta/files/') ||
    !url.pathname.endsWith(':download')
  ) {
    throw new Error('Rejected unexpected Google media download URL')
  }

  const response = await fetch(url, {
    signal: abortSignal,
    redirect: 'error',
  })
  if (!response.ok) {
    throw new Error(
      `Google media download failed: ${response.status} ${response.statusText}`,
    )
  }

  const contentLength = Number(response.headers.get('content-length'))
  if (
    Number.isFinite(contentLength) &&
    contentLength > GOOGLE_MEDIA_DOWNLOAD_MAX_BYTES
  ) {
    throw new Error('Google media download exceeds the 100 MiB limit')
  }

  const data = new Uint8Array(await response.arrayBuffer())
  if (data.byteLength > GOOGLE_MEDIA_DOWNLOAD_MAX_BYTES) {
    throw new Error('Google media download exceeds the 100 MiB limit')
  }

  return {
    data,
    mediaType: response.headers.get('content-type') ?? undefined,
  }
}

async function runGoogleInteraction<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    logger.error(
      { error: getErrorMessage(error) },
      'google_media.interaction_failed',
    )
    throw new Error('Google media generation failed', { cause: error })
  }
}

export async function generateVeoVideo(options: {
  prompt: string
  aspectRatio: VeoAspectRatio
  durationSeconds: number
  media?: MediaBuffer[]
}): Promise<GeneratedMedia> {
  const image = options.media?.[0]
  const response = await runGoogleInteraction(() =>
    generateVideo({
      model: getAiSdkGoogleProvider().video(VEO_3_1_LITE_MODEL),
      prompt: image
        ? {
            image: `data:${image.mimeType};base64,${image.buffer.toString('base64')}`,
            text: options.prompt.trim(),
          }
        : options.prompt.trim(),
      aspectRatio: options.aspectRatio,
      resolution: '1280x720',
      duration: options.durationSeconds,
      generateAudio: true,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(GOOGLE_MEDIA_REQUEST_TIMEOUT_MS),
      download: downloadGoogleMedia,
      providerOptions: {
        google: { pollTimeoutMs: GOOGLE_MEDIA_REQUEST_TIMEOUT_MS },
      },
    }),
  )
  if (!response.video.uint8Array.byteLength) {
    throw new Error('Veo 3.1 Lite returned no video output')
  }
  return {
    buffer: Buffer.from(response.video.uint8Array),
    mimeType: response.video.mediaType,
  }
}

export async function generateLyriaMusic(options: {
  prompt: string
  model: LyriaModel
  media?: MediaBuffer[]
}): Promise<GeneratedMusic> {
  const images = options.media ?? []
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

  return {
    buffer: output.buffer,
    mimeType: output.mimeType,
    text: response.text?.trim() || output.text,
  }
}
