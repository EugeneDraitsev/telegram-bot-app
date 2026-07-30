import * as client from '../client'
import {
  acquireWorkerLease,
  getWorkerIdempotencyKey,
  runIdempotentWorkerTask,
} from '../worker-idempotency'

const mockSet = jest.fn()
const mockEval = jest.fn()
const redis = { set: mockSet, eval: mockEval }
const getRedisClientSpy = jest.spyOn(client, 'getRedisClient')

beforeEach(() => {
  mockSet.mockReset()
  mockEval.mockReset()
  getRedisClientSpy.mockReturnValue(
    redis as unknown as ReturnType<typeof client.getRedisClient>,
  )
})

afterAll(() => {
  getRedisClientSpy.mockRestore()
})

describe('worker idempotency', () => {
  test('builds a namespaced per-message key', () => {
    expect(getWorkerIdempotencyKey('reply-worker', -100, 42)).toBe(
      'reply-worker:message:-100:42',
    )
  })

  test('acquires a lease and exposes atomic owner operations', async () => {
    mockSet.mockResolvedValue('OK')
    mockEval
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(1)

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
      { ex: 45, nx: true },
    )
    expect(await lease?.renew()).toBe(true)
    expect(await lease?.complete()).toBe(true)
    expect(await lease?.release()).toBe(true)
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
    mockSet.mockResolvedValue('OK')
    mockEval.mockResolvedValueOnce('OK')

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
    mockEval.mockResolvedValueOnce(1)

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
    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String),
      ['activity-statistics:message:-100:42'],
      ['request-4'],
    )
  })

  test('fails closed when Redis is unavailable', async () => {
    getRedisClientSpy.mockReturnValue(null)

    await expect(
      acquireWorkerLease('reply-worker', -100, 42, 'request-5'),
    ).rejects.toThrow('Redis is required for worker idempotency')
  })
})
