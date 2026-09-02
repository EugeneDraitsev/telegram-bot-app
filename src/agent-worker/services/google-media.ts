import { generateText, type ModelMessage } from 'ai'

import {
  getAiSdkGoogleProvider,
  getErrorMessage,
  getGoogleApiKey,
  logger,
  type MediaBuffer,
  TRIMMED_VIDEO_MAX_BYTES,
  trimTelegramVideo,
  VIDEO_TRIM_TIMEOUT_MS,
} from '@tg-bot/common'
import {
  extractLyriaInteractionOutput,
  extractOmniInteractionVideo,
} from './google-interactions.adapter'

const GOOGLE_MEDIA_REQUEST_TIMEOUT_MS = 160_000
const GOOGLE_INTERACTIONS_URL =
  'https://generativelanguage.googleapis.com/v1beta/interactions'
// Inline media is base64-encoded in JSON (~4/3 expansion). Keep raw inputs at
// 14 MiB so the encoded media plus request metadata stays below 20 MB.
const MAX_INLINE_MEDIA_RAW_BYTES = 14 * 1024 * 1024
const MAX_OMNI_MEDIA_ITEMS = 3
const MAX_LYRIA_IMAGES = 10

export const GOOGLE_MEDIA_TOOL_TIMEOUT_MS = 170_000
// Omni can spend its whole budget generating after a long input was trimmed.
export const OMNI_VIDEO_TOOL_TIMEOUT_MS =
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS + VIDEO_TRIM_TIMEOUT_MS

export const OMNI_VIDEO_MODEL = 'gemini-omni-1.1-flash'
export const LYRIA_3_CLIP_MODEL = 'lyria-3-clip-preview'
export const LYRIA_3_PRO_MODEL = 'lyria-3-pro-preview'

// 360p keeps generation fast and costs a third of 720p.
const OMNI_VIDEO_RESOLUTION = '360p'
export const MIN_OMNI_VIDEO_SECONDS = 3
export const MAX_OMNI_VIDEO_SECONDS = 10
// Uploaded videos can only be edited or extended when they are this short.
const MAX_OMNI_INPUT_VIDEO_SECONDS = 10
// Omni documents jpeg and png image inputs; animation must arrive as video.
const UNSUPPORTED_OMNI_MIME_TYPES = new Set(['image/gif'])

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
  getInlineBytes: (item: MediaBuffer) => number = (item) =>
    item.buffer.byteLength,
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
    (total, item) => total + getInlineBytes(item),
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
    const itemBytes = getInlineBytes(item)
    if (boundedBytes + itemBytes > MAX_INLINE_MEDIA_RAW_BYTES) {
      continue
    }

    bounded.unshift(item)
    boundedBytes += itemBytes
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

/** A Telegram video Omni cannot use as is, but the trimmer can cut down. */
function isTrimmableVideo(item: MediaBuffer): boolean {
  return (
    item.mediaType === 'video' &&
    Boolean(item.fileId) &&
    item.durationSeconds != null &&
    item.durationSeconds > MAX_OMNI_INPUT_VIDEO_SECONDS
  )
}

/**
 * What the item will really cost inline. A video still awaiting its trim is
 * charged the trimmer's output ceiling rather than its current size, so a long
 * high-bitrate clip is not dropped for a weight it is about to lose.
 */
function getOmniInlineBytes(item: MediaBuffer): number {
  return isTrimmableVideo(item)
    ? TRIMMED_VIDEO_MAX_BYTES
    : item.buffer.byteLength
}

/**
 * Omni Flash accepts images (single frame, first+last frame, subject
 * references) and at most one video to edit or extend. Media the model cannot
 * use is rejected here, before the caller pays for a generation. An over-long
 * video survives when Telegram can serve it again, because `shortenOmniVideos`
 * cuts it down once the generation is committed to.
 */
export function prepareOmniMedia(
  media: MediaBuffer[] | undefined,
  explicit: boolean,
): MediaBuffer[] {
  const prepared = prepareInlineMedia(
    media,
    explicit,
    MAX_OMNI_MEDIA_ITEMS,
    (item) => item.mediaType !== 'audio',
    'Gemini Omni Flash',
    getOmniInlineBytes,
  )

  const unsupported = prepared.find((item) =>
    UNSUPPORTED_OMNI_MIME_TYPES.has(item.mimeType),
  )
  if (unsupported) {
    throw new Error(
      `Gemini Omni Flash does not accept ${unsupported.mimeType} media; an animation has to arrive as a video`,
    )
  }

  const videos = prepared.filter((item) => item.mediaType === 'video')
  const tooLong = videos.find(
    (item) =>
      item.durationSeconds != null &&
      item.durationSeconds > MAX_OMNI_INPUT_VIDEO_SECONDS &&
      !item.fileId,
  )
  if (tooLong) {
    throw new Error(
      `Gemini Omni Flash can only edit or extend videos up to ${MAX_OMNI_INPUT_VIDEO_SECONDS} seconds; the selected video is ${tooLong.durationSeconds} seconds`,
    )
  }

  if (videos.length <= 1) return prepared
  if (explicit) {
    throw new Error('Gemini Omni Flash accepts at most one selected video')
  }

  const newestVideo = videos.at(-1)
  return prepared.filter(
    (item) => item.mediaType !== 'video' || item === newestVideo,
  )
}

async function shortenVideo(
  item: MediaBuffer,
  aspectRatio: OmniAspectRatio,
): Promise<MediaBuffer> {
  const { fileId } = item
  if (!fileId || !isTrimmableVideo(item)) {
    return item
  }

  try {
    const buffer = await trimTelegramVideo({
      fileId,
      maxDurationSeconds: MAX_OMNI_INPUT_VIDEO_SECONDS,
      aspectRatio,
    })

    return {
      ...item,
      buffer,
      mimeType: 'video/mp4',
      durationSeconds: MAX_OMNI_INPUT_VIDEO_SECONDS,
      // The clip was re-framed, so the dimensions Telegram reported are gone.
      width: undefined,
      height: undefined,
    }
  } catch (error) {
    logger.error(
      { error: getErrorMessage(error), fileId },
      'google_media.video_trim_failed',
    )
    throw new Error(
      `Could not shorten the selected video to ${MAX_OMNI_INPUT_VIDEO_SECONDS} seconds`,
      { cause: error },
    )
  }
}

/**
 * Cut every over-long Telegram video or video note down to the few seconds Omni
 * can edit or extend, using the ffmpeg lambda, and centre-crop it to the frame
 * Omni is being asked to produce. Omni only outputs 9:16 or 16:9, so a square
 * video note would otherwise be re-framed by the model itself, which loses the
 * original composition on an edit or an extension. Runs after
 * `prepareOmniMedia` accepted the selection, so only media that is about to
 * reach the model is re-encoded.
 */
export function shortenOmniVideos(
  media: MediaBuffer[],
  aspectRatio: OmniAspectRatio,
): Promise<MediaBuffer[]> {
  return Promise.all(media.map((item) => shortenVideo(item, aspectRatio)))
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

async function postGoogleInteraction(
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(GOOGLE_INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': getGoogleApiKey(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GOOGLE_MEDIA_REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    const details = (await response.text().catch(() => '')).slice(0, 300)
    throw new Error(
      `Google interaction failed: ${response.status} ${response.statusText} ${details}`.trim(),
    )
  }

  return response.json()
}

async function runGoogleInteraction<T>(
  run: () => Promise<T>,
  explain?: (error: unknown) => string | undefined,
): Promise<T> {
  try {
    return await run()
  } catch (error) {
    logger.error(
      { error: getErrorMessage(error) },
      'google_media.interaction_failed',
    )
    // Google's own wording is never forwarded to the chat; only our summary is.
    throw new Error(explain?.(error) ?? 'Google media generation failed', {
      cause: error,
    })
  }
}

/**
 * Omni rejects every request carrying a video input with a 400 blaming the
 * prompt for prohibited content, even when the request has no prompt at all and
 * the video is a test pattern. Video input is simply not enabled, so say that
 * rather than repeating an excuse that sends the user hunting for a bad word.
 */
function explainOmniFailure(
  error: unknown,
  hasVideoInput: boolean,
): string | undefined {
  const message = getErrorMessage(error)
  if (!hasVideoInput || !message.includes('Input blocked')) return undefined

  return 'Gemini Omni Flash cannot edit or extend an uploaded video on this account: it refuses every video input. Generating a new video from an image or from text still works.'
}

/**
 * Omni video generation, editing and extension all use the same Interactions
 * call: media inputs plus a prompt, with the video output format requested
 * through `response_format`. The AI SDK does not expose video response formats
 * yet, so the request is sent directly.
 */
export async function generateOmniVideo(options: {
  prompt: string
  aspectRatio: OmniAspectRatio
  durationSeconds: number
  media?: MediaBuffer[]
}): Promise<GeneratedMedia> {
  const media = options.media ?? []
  const hasVideoInput = media.some((item) => item.mediaType === 'video')
  const body = await runGoogleInteraction(
    () =>
      postGoogleInteraction({
        model: OMNI_VIDEO_MODEL,
        input: [
          ...media.map((item) => ({
            type: item.mediaType === 'video' ? 'video' : 'image',
            mime_type: item.mimeType,
            data: item.buffer.toString('base64'),
          })),
          { type: 'text', text: options.prompt.trim() },
        ],
        response_format: {
          type: 'video',
          aspect_ratio: options.aspectRatio,
          resolution: OMNI_VIDEO_RESOLUTION,
          duration: `${options.durationSeconds}s`,
        },
        store: false,
      }),
    (error) => explainOmniFailure(error, hasVideoInput),
  )

  const video = extractOmniInteractionVideo(body)
  if (!video) throw new Error('Gemini Omni Flash returned no video output')

  return video
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
