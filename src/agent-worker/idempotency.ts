import { getRedisClient } from '@tg-bot/common'

const KEY_PREFIX = 'agent-worker:message'
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

export const AGENT_WORKER_HEARTBEAT_INTERVAL_MS = 15_000

export interface AgentWorkerLease {
  renew(): Promise<boolean>
  complete(): Promise<boolean>
  release(): Promise<boolean>
}

export function getAgentWorkerIdempotencyKey(
  chatId: string | number,
  messageId: number,
): string {
  return `${KEY_PREFIX}:${chatId}:${messageId}`
}

export async function acquireAgentWorkerLease(
  chatId: string | number,
  messageId: number,
  ownerToken: string,
): Promise<AgentWorkerLease | null> {
  const redis = getRedisClient()
  if (!redis) {
    throw new Error('Redis is required for agent worker idempotency')
  }

  const key = getAgentWorkerIdempotencyKey(chatId, messageId)
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
