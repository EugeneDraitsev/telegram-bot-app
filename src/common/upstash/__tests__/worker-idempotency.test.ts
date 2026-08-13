import { readFileSync } from 'node:fs'

import * as client from '../client'
import {
  acquireWorkerLease,
  getWorkerIdempotencyKey,
  runIdempotentWorkerTask,
  WORKER_LEASE_TTL_SECONDS,
} from '../worker-idempotency'

const mockSet = jest.fn()
const mockGetdel = jest.fn()
const redis = { set: mockSet, getdel: mockGetdel }
const getRedisClientSpy = jest.spyOn(client, 'getRedisClient')

beforeEach(() => {
  mockSet.mockReset()
  mockGetdel.mockReset()
  getRedisClientSpy.mockReturnValue(
    redis as unknown as ReturnType<typeof client.getRedisClient>,
  )
})

afterAll(() => {
  getRedisClientSpy.mockRestore()
})

describe('worker idempotency', () => {
  test.each(['telegram-reply-worker', 'telegram-agent-worker'])(
    'lease outlives the %s Lambda timeout',
    (functionName) => {
      const lines = readFileSync('serverless.yml', 'utf8').split('\n')
      const start = lines.indexOf(`  ${functionName}:`)
      const remaining = lines.slice(start + 1)
      const end = remaining.findIndex((line) => /^ {2}\S/.test(line))
      const block = end === -1 ? remaining : remaining.slice(0, end)
      const timeout = Number(
        block.find((line) => /^ {4}timeout:/.test(line))?.split(':')[1],
      )

      expect(start).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(timeout)).toBe(true)
      expect(WORKER_LEASE_TTL_SECONDS).toBeGreaterThan(timeout)
    },
  )

  test('builds a namespaced per-message key', () => {
    expect(getWorkerIdempotencyKey('reply-worker', -100, 42)).toBe(
      'reply-worker:message:-100:42',
    )
  })

  test('acquires a bounded lease and exposes single-command operations', async () => {
    mockSet.mockResolvedValueOnce('OK').mockResolvedValueOnce('request-1')
    mockGetdel.mockResolvedValueOnce('request-1')

    const lease = await acquireWorkerLease(
      'reply-worker',
      -100,
      42,
      'request-1',
    )

    expect(lease).not.toBeNull()
    expect(mockSet).toHaveBeenCalledWith(
      'reply-worker:message:-100:42',
      'request-1',
      { ex: 360, nx: true },
    )
    expect(await lease?.complete()).toBe(true)
    expect(mockSet).toHaveBeenLastCalledWith(
      'reply-worker:message:-100:42',
      'completed',
      { ex: 3 * 60 * 60, get: true, xx: true },
    )
    expect(await lease?.release()).toBe(false)
    expect(mockGetdel).not.toHaveBeenCalled()
  })

  test('skips a completed or in-flight task', async () => {
    mockSet.mockResolvedValue(null)
    const task = jest.fn().mockResolvedValue('done')

    await expect(
      runIdempotentWorkerTask({
        namespace: 'activity-statistics',
        chatId: -100,
        messageId: 42,
        ownerToken: 'request-2',
        task,
      }),
    ).resolves.toEqual({ duplicate: true })
    expect(task).not.toHaveBeenCalled()
  })

  test('marks successful tasks as completed', async () => {
    mockSet.mockResolvedValueOnce('OK').mockResolvedValueOnce('request-3')

    await expect(
      runIdempotentWorkerTask({
        namespace: 'activity-statistics',
        chatId: -100,
        messageId: 42,
        ownerToken: 'request-3',
        task: async () => 'done',
      }),
    ).resolves.toEqual({ duplicate: false, value: 'done' })
  })

  test('releases failed tasks so Lambda retries can run them', async () => {
    const error = new Error('write failed')
    mockSet.mockResolvedValue('OK')
    mockGetdel.mockResolvedValueOnce('request-4')

    await expect(
      runIdempotentWorkerTask({
        namespace: 'activity-statistics',
        chatId: -100,
        messageId: 42,
        ownerToken: 'request-4',
        task: async () => {
          throw error
        },
      }),
    ).rejects.toBe(error)
    expect(mockGetdel).toHaveBeenCalledWith(
      'activity-statistics:message:-100:42',
    )
  })

  test('fails closed when Redis is unavailable', async () => {
    getRedisClientSpy.mockReturnValue(null)

    await expect(
      acquireWorkerLease('reply-worker', -100, 42, 'request-5'),
    ).rejects.toThrow('Redis is required for worker idempotency')
  })
})
