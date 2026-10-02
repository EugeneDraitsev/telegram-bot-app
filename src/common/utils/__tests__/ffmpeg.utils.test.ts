import * as childProcess from 'node:child_process'
import { EventEmitter } from 'node:events'

import { runFfmpeg } from '../ffmpeg.utils'

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter()
  readonly stderr = new EventEmitter()
  readonly stdin = Object.assign(new EventEmitter(), { end: jest.fn() })
  readonly kill = jest.fn()
}

describe('runFfmpeg', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('pipes binary input and joins encoded output only after a successful exit', async () => {
    const child = new FakeChild()
    jest
      .spyOn(childProcess, 'spawn')
      .mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>,
      )
    const input = Buffer.from([0, 1, 2, 3])
    const result = runFfmpeg(['-i', 'pipe:0', 'pipe:1'], input)
    expect(child.stdin.end).toHaveBeenCalledWith(input)
    child.stdout.emit('data', Buffer.from('Ogg'))
    child.stdout.emit('data', Buffer.from('S'))
    child.emit('close', 0)

    await expect(result).resolves.toEqual(Buffer.from('OggS'))
  })

  test('does not deliver partial output after an encoding failure', async () => {
    const child = new FakeChild()
    jest
      .spyOn(childProcess, 'spawn')
      .mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>,
      )
    const result = runFfmpeg(['pipe:1'], Buffer.from('pcm'))
    child.stdout.emit('data', Buffer.from('partial'))
    child.stderr.emit('data', 'Invalid audio')
    child.emit('close', 1)

    await expect(result).rejects.toThrow('ffmpeg exited with 1: Invalid audio')
  })

  test('accepts encoded speech beyond the old four-MiB limit', async () => {
    const child = new FakeChild()
    jest
      .spyOn(childProcess, 'spawn')
      .mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>,
      )
    const result = runFfmpeg(['pipe:1'], Buffer.from('wav'))
    child.stdout.emit('data', Buffer.alloc(5 * 1024 * 1024))
    child.emit('close', 0)
    expect((await result).byteLength).toBe(5 * 1024 * 1024)
  })

  test('kills the encoder when its output exceeds the eight-MiB bound', async () => {
    const child = new FakeChild()
    jest
      .spyOn(childProcess, 'spawn')
      .mockReturnValue(
        child as unknown as ReturnType<typeof childProcess.spawn>,
      )
    const result = runFfmpeg(['pipe:1'], Buffer.from('wav'))
    child.stdout.emit('data', Buffer.alloc(8 * 1024 * 1024 + 1))
    await expect(result).rejects.toThrow('output exceeds the byte limit')
    expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  })
})
