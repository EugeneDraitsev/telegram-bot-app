import { logger } from '../logger'
import { getRedisClient } from './client'

const LEASE_TTL_SECONDS = 45
const COMPLETED_TTL_SECONDS = 60 * 60 * 24

const RENEW_LEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
end
return 0
`

const COMPLETE_LEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("SET", KEYS[1], "completed", "EX", ARGV[2])
end
return nil
`

const RELEASE_LEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`

export const WORKER_LEASE_HEARTBEAT_INTERVAL_MS = 15_000

export interface WorkerLease {
  renew(): Promise<boolean>
  complete(): Promise<boolean>
  release(): Promise<boolean>
}

export function getWorkerIdempotencyKey(
  namespace: string,
  chatId: string | number,
  messageId: number,
): string {
  return `${namespace}:message:${chatId}:${messageId}`
}

export async function acquireWorkerLease(
  namespace: string,
  chatId: string | number,
  messageId: number,
  ownerToken: string,
): Promise<WorkerLease | null> {
  const redis = getRedisClient()
  if (!redis) {
    throw new Error('Redis is required for worker idempotency')
  }

  const key = getWorkerIdempotencyKey(namespace, chatId, messageId)
  const acquired = await redis.set(key, ownerToken, {
    ex: LEASE_TTL_SECONDS,
    nx: true,
  })
  if (acquired !== 'OK') {
    return null
  }

  return {
    async renew() {
      const result = await redis.eval(
        RENEW_LEASE_SCRIPT,
        [key],
        [ownerToken, String(LEASE_TTL_SECONDS)],
      )
      return result === 1
    },
    async complete() {
      const result = await redis.eval(
        COMPLETE_LEASE_SCRIPT,
        [key],
        [ownerToken, String(COMPLETED_TTL_SECONDS)],
      )
      return result === 'OK'
    },
    async release() {
      const result = await redis.eval(RELEASE_LEASE_SCRIPT, [key], [ownerToken])
      return result === 1
    },
  }
}

function startLeaseHeartbeat(
  lease: WorkerLease,
  namespace: string,
  chatId: string | number,
  messageId: number,
) {
  const heartbeat = setInterval(() => {
    void lease
      .renew()
      .then((renewed) => {
        if (!renewed) {
          logger.warn({ namespace, chatId, messageId }, 'worker.lease_lost')
        }
      })
      .catch((error) =>
        logger.warn(
          { namespace, chatId, messageId, error },
          'worker.heartbeat_failed',
        ),
      )
  }, WORKER_LEASE_HEARTBEAT_INTERVAL_MS)
  heartbeat.unref()
  return heartbeat
}

export async function runIdempotentWorkerTask<T>({
  namespace,
  chatId,
  messageId,
  ownerToken,
  task,
}: {
  namespace: string
  chatId: string | number
  messageId: number
  ownerToken: string
  task: () => Promise<T>
}): Promise<{ duplicate: boolean; value?: T }> {
  const lease = await acquireWorkerLease(
    namespace,
    chatId,
    messageId,
    ownerToken,
  )
  if (!lease) {
    return { duplicate: true }
  }

  const heartbeat = startLeaseHeartbeat(lease, namespace, chatId, messageId)
  try {
    const value = await task()
    try {
      if (!(await lease.complete())) {
        logger.warn(
          { namespace, chatId, messageId },
          'worker.completion_marker_failed',
        )
      }
    } catch (error) {
      logger.warn(
        { namespace, chatId, messageId, error },
        'worker.completion_marker_failed',
      )
    }
    return { duplicate: false, value }
  } catch (error) {
    try {
      await lease.release()
    } catch (releaseError) {
      logger.warn(
        { namespace, chatId, messageId, error: releaseError },
        'worker.lease_release_failed',
      )
    }
    throw error
  } finally {
    clearInterval(heartbeat)
  }
}
