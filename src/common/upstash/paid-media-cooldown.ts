import { getRedisClient } from './client'

export const PAID_MEDIA_COOLDOWN_SECONDS = 60

type RedisClient = NonNullable<ReturnType<typeof getRedisClient>>

let redisClientOverride: RedisClient | null | undefined

export function getPaidMediaCooldownKey(userId: string | number): string {
  return `agent:paid-media:user:${encodeURIComponent(String(userId))}`
}

export function setPaidMediaCooldownRedisClientForTests(
  redis: RedisClient | null | undefined,
): void {
  redisClientOverride = redis
}

/**
 * Claim a short per-user generation window before calling a billed provider.
 * This intentionally limits start frequency; it is not a long-held mutex for
 * the full provider call. Same-request concurrency is guarded in tool context.
 * Failed provider calls keep the short window because a late error can still
 * represent accepted or billed work and should not trigger an immediate retry.
 * Offline development and deployments without Redis keep their existing
 * behavior; production workers already require Redis for idempotency.
 */
export async function acquirePaidMediaCooldown(
  userId: string | number,
): Promise<boolean> {
  if (process.env.IS_OFFLINE === 'true') return true

  const redis =
    redisClientOverride === undefined ? getRedisClient() : redisClientOverride
  if (!redis) return true

  const acquired = await redis.set(getPaidMediaCooldownKey(userId), '1', {
    ex: PAID_MEDIA_COOLDOWN_SECONDS,
    nx: true,
  })
  return acquired === 'OK'
}
