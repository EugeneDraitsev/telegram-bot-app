import { generateText, type ModelMessage } from 'ai'

import {
  createAiSdkGoogleProvider,
  getAiSdkGoogleProvider,
  getErrorMessage,
  logger,
  type MediaBuffer,
} from '@tg-bot/common'
import {
  adaptOmniInteractionRequest,
  extractLyriaInteractionOutput,
} from './google-interactions.adapter'

const GOOGLE_MEDIA_REQUEST_TIMEOUT_MS = 160_000
// Inline media is base64-encoded in JSON (~4/3 expansion). Keep raw inputs at
// 14 MiB so the encoded media plus request metadata stays below 20 MB.
const MAX_INLINE_MEDIA_RAW_BYTES = 14 * 1024 * 1024
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

export function prepareOmniMedia(
  media: MediaBuffer[] | undefined,
  explicit: boolean,
): MediaBuffer[] {
  return prepareInlineMedia(
    media,
    explicit,
    MAX_OMNI_MEDIA_ITEMS,
    (item) => item.mediaType === 'image' || item.mediaType === 'video',
    'Gemini Omni',
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

export function createOmniFetch(
  aspectRatio: OmniAspectRatio,
  durationSeconds: number,
  transport: typeof fetch = fetch,
): typeof fetch {
  // TODO: Remove this adapter when @ai-sdk/google supports video responseFormat.
  return async (input, init) => {
    if (typeof init?.body !== 'string') {
      logger.warn(
        { bodyType: typeof init?.body },
        'google_media.omni_request_adapter_failed',
      )
      throw new Error(
        'Gemini Omni request could not be adapted to the required video format',
      )
    }

    let body: unknown
    try {
      body = adaptOmniInteractionRequest(
        JSON.parse(init.body),
        aspectRatio,
        durationSeconds,
      )
    } catch (error) {
      logger.warn(
        { error: getErrorMessage(error) },
        'google_media.omni_request_adapter_failed',
      )
      throw new Error(
        'Gemini Omni request could not be adapted to the required video format',
        { cause: error },
      )
    }

    return transport(input, { ...init, body: JSON.stringify(body) })
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

export async function generateOmniVideo(options: {
  prompt: string
  aspectRatio: OmniAspectRatio
  durationSeconds: number
  media?: MediaBuffer[]
}): Promise<GeneratedMedia> {
  const media = options.media ?? []
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
  return {
    buffer: Buffer.from(video.uint8Array),
    mimeType: video.mediaType,
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
