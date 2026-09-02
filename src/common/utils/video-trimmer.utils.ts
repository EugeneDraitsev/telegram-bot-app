import { getRequiredEnv } from './env.utils'
import { invokeLambdaForBuffer } from './lambda.utils'

/** Upper bound for one trim round trip, including the ffmpeg lambda cold start. */
export const VIDEO_TRIM_TIMEOUT_MS = 60_000

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
