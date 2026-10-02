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
})
