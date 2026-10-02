import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  getErrorMessage,
  getRequiredEnv,
  logger,
  runFfmpeg,
  TRIMMED_VIDEO_MAX_BYTES,
} from '@tg-bot/common'

export { getFfmpegPath } from '@tg-bot/common'

type AspectRatio = '9:16' | '16:9'

interface VideoTrimmerEvent {
  fileId?: unknown
  maxDurationSeconds?: unknown
  aspectRatio?: unknown
  /** 'frames' returns the clip's first and last still instead of the video. */
  output?: unknown
}

const DEFAULT_MAX_DURATION_SECONDS = 10
const MAX_DURATION_SECONDS = 60
// Telegram never serves a bot more than 20 MB through the file API.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_LONG_SIDE = 720
const CROP_RATIOS: Record<AspectRatio, [number, number]> = {
  '9:16': [9, 16],
  '16:9': [16, 9],
}
// Stills are picked inside a window at each end rather than at the exact edge:
// an opening frame is often a fade from black and a closing one a fade to it.
const FRAME_WINDOW_SECONDS = 2
const FRAME_WINDOW_BATCH = 50
export function getAspectRatio(value: unknown): AspectRatio | undefined {
  return value === '9:16' || value === '16:9' ? value : undefined
}

export function getMaxDurationSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_MAX_DURATION_SECONDS
  }

  return Math.min(MAX_DURATION_SECONDS, Math.max(1, Math.round(value)))
}

/**
 * Fit the frame inside a 720px box without ever upscaling, which keeps the
 * reply small enough to travel in a Lambda payload. A target aspect ratio first
 * centre-crops the frame to that shape; padding is deliberately avoided because
 * a generator copies the black bars straight into its own output.
 */
export function getVideoFilters(aspectRatio?: AspectRatio): string {
  const scale = `scale=w='min(${MAX_LONG_SIDE},iw)':h='min(${MAX_LONG_SIDE},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2`
  if (!aspectRatio) return scale

  const [width, height] = CROP_RATIOS[aspectRatio]
  const cropWidth = `trunc(min(iw,ih*${width}/${height})/2)*2`
  const cropHeight = `trunc(min(ih,iw*${height}/${width})/2)*2`

  return `crop=w='${cropWidth}':h='${cropHeight}',${scale}`
}

/**
 * The first and last still of the clip, reframed like the video would be.
 * A generator given both ends interpolates the motion that was really there,
 * which one frame alone can only invent.
 */
export function getFrameArgs(
  inputPath: string,
  outputPath: string,
  aspectRatio: AspectRatio | undefined,
  position: 'first' | 'last',
): string[] {
  return [
    '-y',
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    // Seeking from the end has to be requested before the input is opened.
    ...(position === 'last' ? ['-sseof', `-${FRAME_WINDOW_SECONDS}`] : []),
    '-i',
    inputPath,
    ...(position === 'first' ? ['-t', String(FRAME_WINDOW_SECONDS)] : []),
    // thumbnail picks the frame least like the window's average, which skips
    // fades and mid-blur. It still emits at EOF on a window short of a batch.
    `-vf`,
    `${getVideoFilters(aspectRatio)},thumbnail=${FRAME_WINDOW_BATCH}`,
    '-frames:v',
    '1',
    '-update',
    '1',
    '-q:v',
    '3',
    outputPath,
  ]
}

/** Cut the head of the clip and reframe it for the model that consumes it. */
export function getFfmpegArgs(
  inputPath: string,
  outputPath: string,
  maxDurationSeconds: number,
  aspectRatio?: AspectRatio,
): string[] {
  return [
    '-y',
    '-hide_banner',
    '-nostdin',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-t',
    String(maxDurationSeconds),
    '-vf',
    getVideoFilters(aspectRatio),
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-maxrate',
    '1500k',
    '-bufsize',
    '3000k',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-ac',
    '1',
    '-movflags',
    '+faststart',
    '-f',
    'mp4',
    outputPath,
  ]
}

/**
 * Telegram answers `getFile` with a plain relative path. Anything else is
 * refused rather than pasted into the download URL, where `..` segments or an
 * absolute path could steer the request somewhere unintended.
 */
function isPlainRelativePath(filePath: string): boolean {
  const segments = filePath.split('/')

  return (
    segments.length > 0 &&
    segments.every(
      (segment) =>
        /^[\w.-]+$/.test(segment) && segment !== '.' && segment !== '..',
    )
  )
}

function assertSourceSize(bytes: number): void {
  if (bytes > MAX_SOURCE_BYTES) {
    throw new Error(`Source video exceeds ${MAX_SOURCE_BYTES} bytes`)
  }
}

async function downloadTelegramFile(fileId: string): Promise<Buffer> {
  const token = getRequiredEnv('TOKEN')
  const fileResponse = await fetch(
    `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
  )
  if (!fileResponse.ok) {
    throw new Error(`Telegram getFile failed: ${fileResponse.status}`)
  }

  const filePath = (await fileResponse.json())?.result?.file_path
  if (typeof filePath !== 'string' || !isPlainRelativePath(filePath)) {
    throw new Error('Telegram returned no usable file path')
  }

  const download = await fetch(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
  )
  if (!download.ok) {
    throw new Error(`Telegram file download failed: ${download.status}`)
  }

  // Checked from the header first so an oversized body is refused before it is
  // buffered, then again because the header is advisory.
  assertSourceSize(Number(download.headers.get('content-length')))
  const source = Buffer.from(await download.arrayBuffer())
  assertSourceSize(source.byteLength)

  return source
}

/**
 * A clip too short to seek into from the end yields only its opening still; one
 * usable frame beats failing the whole request.
 */
async function extractFrames(
  workDir: string,
  inputPath: string,
  aspectRatio: AspectRatio | undefined,
): Promise<Buffer[]> {
  const frames: Buffer[] = []

  for (const position of ['first', 'last'] as const) {
    const framePath = path.join(workDir, `${position}.jpg`)
    try {
      await runFfmpeg(getFrameArgs(inputPath, framePath, aspectRatio, position))
      const frame = await readFile(framePath)
      // Both windows cover the whole of a very short clip and then land on the
      // same still; one image asks the model to animate rather than to
      // interpolate between two identical ends.
      if (frame.byteLength > 0 && !frames.some((kept) => kept.equals(frame))) {
        frames.push(frame)
      }
    } catch (error) {
      logger.warn(
        { error: getErrorMessage(error), position },
        'video_trimmer.frame_failed',
      )
    }
  }

  if (!frames.length) throw new Error('ffmpeg produced no frames')

  return frames
}

/**
 * Shorten one Telegram video, video note or animation so it fits the limits of
 * models that only accept a few seconds of input in a fixed frame shape.
 */
const videoTrimmerHandler = async (event: VideoTrimmerEvent) => {
  const fileId = typeof event.fileId === 'string' ? event.fileId.trim() : ''
  const maxDurationSeconds = getMaxDurationSeconds(event.maxDurationSeconds)
  const aspectRatio = getAspectRatio(event.aspectRatio)
  let workDir: string | undefined

  try {
    if (!fileId) throw new Error('fileId is required')

    workDir = await mkdtemp(path.join(tmpdir(), 'video-trimmer-'))
    const inputPath = path.join(workDir, 'input')
    const outputPath = path.join(workDir, 'output.mp4')

    await writeFile(inputPath, await downloadTelegramFile(fileId))

    if (event.output === 'frames') {
      const frames = await extractFrames(workDir, inputPath, aspectRatio)

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frames: frames.map((frame) => frame.toString('base64')),
        }),
      }
    }

    await runFfmpeg(
      getFfmpegArgs(inputPath, outputPath, maxDurationSeconds, aspectRatio),
    )
    const trimmed = await readFile(outputPath)

    if (trimmed.byteLength === 0) {
      throw new Error('ffmpeg produced an empty video')
    }
    if (trimmed.byteLength > TRIMMED_VIDEO_MAX_BYTES) {
      throw new Error(
        `Trimmed video is ${trimmed.byteLength} bytes, above the ${TRIMMED_VIDEO_MAX_BYTES} byte limit`,
      )
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'video/mp4' },
      isBase64Encoded: true,
      body: trimmed.toString('base64'),
    }
  } catch (error) {
    const message = getErrorMessage(error)
    logger.error({ error: message, fileId }, 'video_trimmer.failed')

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    }
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true })
  }
}

export default videoTrimmerHandler
