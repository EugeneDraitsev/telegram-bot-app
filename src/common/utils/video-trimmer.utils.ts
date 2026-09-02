import { getRequiredEnv } from './env.utils'
import { invokeLambdaForBuffer, invokeLambdaForJson } from './lambda.utils'

/** Upper bound for one trim round trip, including the ffmpeg lambda cold start. */
export const VIDEO_TRIM_TIMEOUT_MS = 60_000

/**
 * Ceiling the trimmer enforces on its own output. Base64 inflates the reply by
 * 4/3, so this stays well under the 6 MB Lambda response cap, and it also tells
 * callers how much inline budget a not-yet-trimmed video will end up costing.
 */
export const TRIMMED_VIDEO_MAX_BYTES = 4 * 1024 * 1024

/**
 * Invoke the video-trimmer lambda, which re-downloads the Telegram file and
 * returns its first `maxDurationSeconds` re-encoded as a small mp4. An
 * `aspectRatio` also centre-crops the clip to that frame shape.
 */
export async function trimTelegramVideo(options: {
  fileId: string
  maxDurationSeconds: number
  aspectRatio?: '9:16' | '16:9'
}): Promise<Buffer> {
  return invokeLambdaForBuffer({
    label: 'video trimmer',
    name: getRequiredEnv('VIDEO_TRIMMER_FUNCTION_NAME'),
    customEndpoint: true,
    payload: {
      fileId: options.fileId,
      maxDurationSeconds: options.maxDurationSeconds,
      ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
    },
  })
}

/**
 * The first and last still of the same trimmed, reframed clip. Both ends let a
 * generator interpolate the motion the clip really had, so this is what a model
 * that refuses video input gets instead.
 */
export async function extractTelegramVideoFrames(options: {
  fileId: string
  maxDurationSeconds: number
  aspectRatio?: '9:16' | '16:9'
}): Promise<Buffer[]> {
  const { frames } = await invokeLambdaForJson<{ frames?: unknown }>({
    label: 'video trimmer',
    name: getRequiredEnv('VIDEO_TRIMMER_FUNCTION_NAME'),
    customEndpoint: true,
    payload: {
      fileId: options.fileId,
      maxDurationSeconds: options.maxDurationSeconds,
      output: 'frames',
      ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
    },
  })

  const decoded = (Array.isArray(frames) ? frames : [])
    .filter((frame): frame is string => typeof frame === 'string' && !!frame)
    .map((frame) => Buffer.from(frame, 'base64'))
    .filter((frame) => frame.byteLength > 0)

  if (!decoded.length) throw new Error('video trimmer returned no frames')

  return decoded
}
