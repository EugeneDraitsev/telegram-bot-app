import { spawn } from 'node:child_process'
import {
  accessSync,
  chmodSync,
  constants,
  copyFileSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const FFMPEG_TIMEOUT_MS = 45_000
const LAYER_FFMPEG_PATH = '/opt/bin/ffmpeg'
const RUNTIME_FFMPEG_PATH = path.join(tmpdir(), 'ffmpeg')
const MAX_FFMPEG_STDERR_CHARS = 2_000
const MAX_FFMPEG_STDOUT_BYTES = 4 * 1024 * 1024

/** Windows-built layers may need an executable copy on Lambda's /tmp. */
export function getFfmpegPath(): string {
  const configured = process.env.FFMPEG_PATH?.trim()
  if (configured) return configured
  if (existsSync(RUNTIME_FFMPEG_PATH)) return RUNTIME_FFMPEG_PATH
  if (!existsSync(LAYER_FFMPEG_PATH)) return 'ffmpeg'

  try {
    accessSync(LAYER_FFMPEG_PATH, constants.X_OK)
    return LAYER_FFMPEG_PATH
  } catch {
    copyFileSync(LAYER_FFMPEG_PATH, RUNTIME_FFMPEG_PATH)
    chmodSync(RUNTIME_FFMPEG_PATH, 0o755)
    return RUNTIME_FFMPEG_PATH
  }
}

/** Supports file conversion and bounded, in-memory audio conversion. */
export function runFfmpeg(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const binary = getFfmpegPath()
    const child = spawn(binary, args, {
      timeout: FFMPEG_TIMEOUT_MS,
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })
    const output: Buffer[] = []
    let outputBytes = 0
    let stderr = ''

    child.stdout?.on('data', (chunk: Buffer) => {
      outputBytes += chunk.byteLength
      if (outputBytes > MAX_FFMPEG_STDOUT_BYTES) {
        child.kill('SIGKILL')
        reject(new Error('ffmpeg output exceeds the byte limit'))
        return
      }
      output.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer | string) => {
      stderr = `${stderr}${chunk}`.slice(-MAX_FFMPEG_STDERR_CHARS)
    })
    child.on('error', (error: NodeJS.ErrnoException) => {
      reject(
        error.code === 'ENOENT'
          ? new Error(
              `ffmpeg not found at ${binary}; install it or set FFMPEG_PATH to run outside Lambda`,
            )
          : error,
      )
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve(Buffer.concat(output))
        return
      }

      const details = stderr.trim().slice(0, 300)
      reject(
        new Error(`ffmpeg exited with ${code}${details ? `: ${details}` : ''}`),
      )
    })
    child.stdin?.on('error', (error) => {
      child.kill('SIGKILL')
      reject(error)
    })
    if (input) child.stdin?.end(input)
  })
}
