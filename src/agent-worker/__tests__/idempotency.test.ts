import * as common from '@tg-bot/common'
import {
  acquireAgentWorkerLease,
  getAgentWorkerIdempotencyKey,
} from '../idempotency'

const mockSet = jest.fn()
const mockEval = jest.fn()
const redis = { set: mockSet, eval: mockEval }
const getRedisClientSpy = jest.spyOn(common, 'getRedisClient')

beforeEach(() => {
  mockSet.mockReset()
  mockEval.mockReset()
  getRedisClientSpy.mockReturnValue(
    redis as unknown as ReturnType<typeof common.getRedisClient>,
  )
})

describe('agent worker idempotency', () => {
  test('builds a stable per-message key', () => {
    expect(getAgentWorkerIdempotencyKey(-100, 42)).toBe(
      'agent-worker:message:-100:42',
    )
  })

  test('acquires a lease and exposes atomic owner operations', async () => {
    mockSet.mockResolvedValue('OK')
    mockEval
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce('OK')
      .mockResolvedValueOnce(1)

    const lease = await acquireAgentWorkerLease(-100, 42, 'request-1')

    expect(lease).not.toBeNull()
    expect(mockSet).toHaveBeenCalledWith(
      'agent-worker:message:-100:42',
      'request-1',
      { ex: 45, nx: true },
    )
    expect(await lease?.renew()).toBe(true)
    expect(await lease?.complete()).toBe(true)
    expect(await lease?.release()).toBe(true)
    expect(mockEval).toHaveBeenNthCalledWith(
      1,
      expect.any(String),
      ['agent-worker:message:-100:42'],
      ['request-1', '45'],
    )
  })

  test('skips a message that already has a lease or completion marker', async () => {
    mockSet.mockResolvedValue(null)

    await expect(
      acquireAgentWorkerLease(-100, 42, 'request-2'),
    ).resolves.toBeNull()
  })

  test('does not mutate a lease owned by another invocation', async () => {
    mockSet.mockResolvedValue('OK')
    mockEval
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(0)
    const lease = await acquireAgentWorkerLease(-100, 42, 'request-2')

    expect(await lease?.renew()).toBe(false)
    expect(await lease?.complete()).toBe(false)
    expect(await lease?.release()).toBe(false)
  })

  test('fails instead of processing without idempotency storage', async () => {
    getRedisClientSpy.mockReturnValue(null)

    await expect(
      acquireAgentWorkerLease(-100, 42, 'request-3'),
    ).rejects.toThrow('Redis is required for agent worker idempotency')
  })
})
