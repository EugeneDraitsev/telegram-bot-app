import { logger } from '../logger'
import { getRedisClient } from './client'

// Both Redis-backed workers have a 300 second Lambda timeout. Keeping the
// processing marker alive for one extra minute means it cannot expire while a
// healthy invocation is still able to produce Telegram side effects. That
// removes the need for command-heavy Lua heartbeats.
export const WORKER_LEASE_TTL_SECONDS = 6 * 60
// Deliberately generous rather than derived: nothing bounds redelivery lag to a
// few hours. maxReceiveCount limits attempts, not the time between them, a
// message can wait out the whole MessageRetentionPeriod behind a throttled or
// backed up consumer, and ingress re-enqueues on Telegram webhook retries once
// past the 5 minute SQS producer dedup window. Healthy redelivery lands within
// minutes, so 3h is a wide margin on the normal case; a duplicate reply is the
// cost if a pathological one ever exceeds it.
const COMPLETED_TTL_SECONDS = 60 * 60 * 3

export interface WorkerLease {
  complete(): Promise<boolean>
  release(): Promise<boolean>
}

const OFFLINE_WORKER_LEASE: WorkerLease = {
  async complete() {
    return true
  },
  async release() {
    return true
  },
}
let offlineBypassWarned = false

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
  // Intentionally bypass every worker namespace in serverless-offline. Local
  // webhook tests must be able to replay one Telegram update end-to-end with
  // the same message id; deployed stages never set IS_OFFLINE. Do not couple
  // this to a stage name: IS_OFFLINE is the serverless-offline runtime signal
  // and local runs may use any stage. The warning is process-wide on purpose
  // to keep local logs quiet after the first notice.
  if (process.env.IS_OFFLINE === 'true') {
    if (!offlineBypassWarned) {
      offlineBypassWarned = true
      logger.warn({ namespace }, 'worker.idempotency_offline_bypass')
    }
    return OFFLINE_WORKER_LEASE
  }

  const redis = getRedisClient()
  if (!redis) {
    throw new Error('Redis is required for worker idempotency')
  }

  const key = getWorkerIdempotencyKey(namespace, chatId, messageId)
  const acquired = await redis.set(key, ownerToken, {
    ex: WORKER_LEASE_TTL_SECONDS,
    nx: true,
  })
  if (acquired !== 'OK') {
    return null
  }

  // Production only ever settles once, but keep the lease object safe if a
  // caller accidentally tries both paths. GETDEL is intentionally
  // unconditional under the fixed-lease invariant, so calling it after a
  // successful completion would otherwise remove the completed marker.
  let settled = false

  return {
    async complete() {
      if (settled) return false
      settled = true
      const previousOwner = await redis.set(key, 'completed', {
        ex: COMPLETED_TTL_SECONDS,
        get: true,
        xx: true,
      })
      return previousOwner === ownerToken
    },
    async release() {
      if (settled) return false
      settled = true
      const previousOwner = await redis.getdel<string>(key)
      return previousOwner === ownerToken
    },
  }
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
  }
}
