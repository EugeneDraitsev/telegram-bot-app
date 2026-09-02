import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'

const mockSpawn = jest.fn()

jest.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawn(...args),
}))

import videoTrimmerHandler, {
  getFfmpegArgs,
  getMaxDurationSeconds,
  getVideoFilters,
} from '..'

interface FakeChild extends EventEmitter {
  stderr: EventEmitter
}

function fakeFfmpeg(run: (args: string[]) => Promise<number>): void {
  mockSpawn.mockImplementation((_binary: string, args: string[]) => {
    const child = new EventEmitter() as FakeChild
    child.stderr = new EventEmitter()

    run(args).then((code) => {
      if (code !== 0) child.stderr.emit('data', 'Invalid data found')
      child.emit('close', code)
    })

    return child
  })
}

function telegramResponses(video: Buffer) {
  const respond = async (input: string) =>
    input.includes('/getFile')
      ? Response.json({ ok: true, result: { file_path: 'videos/file_1.mp4' } })
      : new Response(new Uint8Array(video))

  return jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(respond as unknown as typeof fetch)
}

describe('video-trimmer lambda', () => {
  beforeEach(() => {
    process.env.TOKEN = 'test-token'
    process.env.FFMPEG_PATH = 'ffmpeg'
    mockSpawn.mockReset()
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env.FFMPEG_PATH
  })

  test('bounds the requested duration', () => {
    expect(getMaxDurationSeconds(undefined)).toBe(10)
    expect(getMaxDurationSeconds('8')).toBe(10)
    expect(getMaxDurationSeconds(6.4)).toBe(6)
    expect(getMaxDurationSeconds(0)).toBe(1)
    expect(getMaxDurationSeconds(600)).toBe(60)
  })

  test('cuts the head of the clip and fits it in a 720px box', () => {
    const args = getFfmpegArgs('in.mp4', 'out.mp4', 10)

    expect(args.slice(args.indexOf('-t'), args.indexOf('-t') + 2)).toEqual([
      '-t',
      '10',
    ])
    expect(args[args.indexOf('-vf') + 1]).toBe(getVideoFilters())
    expect(args.at(-1)).toBe('out.mp4')
  })

  test('keeps the source shape when no aspect ratio is asked for', () => {
    const filters = getVideoFilters()

    expect(filters).not.toContain('crop=')
    expect(filters).toContain(
      "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease",
    )
  })

  test('centre-crops to the requested frame before scaling', () => {
    expect(getVideoFilters('9:16')).toBe(
      `crop=w='trunc(min(iw,ih*9/16)/2)*2':h='trunc(min(ih,iw*16/9)/2)*2',${getVideoFilters()}`,
    )
    expect(getVideoFilters('16:9')).toBe(
      `crop=w='trunc(min(iw,ih*16/9)/2)*2':h='trunc(min(ih,iw*9/16)/2)*2',${getVideoFilters()}`,
    )
  })

  test('returns the trimmed video as a base64 body', async () => {
    telegramResponses(Buffer.from('source-video'))
    let inputPath = ''
    fakeFfmpeg(async (args) => {
      inputPath = args[args.indexOf('-i') + 1] ?? ''
      await writeFile(String(args.at(-1)), 'trimmed-video')
      return 0
    })

    const response = await videoTrimmerHandler({
      fileId: 'file-1',
      maxDurationSeconds: 10,
      aspectRatio: '9:16',
    })

    expect(response.statusCode).toBe(200)
    expect(Buffer.from(response.body, 'base64').toString()).toBe(
      'trimmed-video',
    )
    expect(mockSpawn.mock.calls[0]?.[1]).toContain(getVideoFilters('9:16'))
    // The work directory is removed even on the happy path.
    expect(existsSync(inputPath)).toBe(false)
  })

  test('reports the ffmpeg failure instead of an empty video', async () => {
    telegramResponses(Buffer.from('source-video'))
    fakeFfmpeg(async () => 1)

    const response = await videoTrimmerHandler({ fileId: 'file-1' })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toContain('ffmpeg exited with 1')
  })

  test('refuses a file path that is not a plain relative path', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((async () =>
      Response.json({
        ok: true,
        result: { file_path: '../../secrets/file_1.mp4' },
      })) as unknown as typeof fetch)

    const response = await videoTrimmerHandler({ fileId: 'file-1' })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toBe(
      'Telegram returned no usable file path',
    )
    expect(mockSpawn).not.toHaveBeenCalled()
  })

  test('refuses an oversized download before buffering it', async () => {
    const arrayBuffer = jest.fn()
    jest.spyOn(globalThis, 'fetch').mockImplementation((async (
      input: string,
    ) =>
      input.includes('/getFile')
        ? Response.json({
            ok: true,
            result: { file_path: 'videos/file_1.mp4' },
          })
        : {
            ok: true,
            headers: new Headers({
              'content-length': String(64 * 1024 * 1024),
            }),
            arrayBuffer,
          }) as unknown as typeof fetch)

    const response = await videoTrimmerHandler({ fileId: 'file-1' })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toContain('Source video exceeds')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  test('requires a file id', async () => {
    const response = await videoTrimmerHandler({ fileId: '  ' })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body).error).toBe('fileId is required')
    expect(mockSpawn).not.toHaveBeenCalled()
  })
})
