import { Redis } from '@upstash/redis'

// Without a deadline a stalled request waits out the fetch defaults while it
// holds a worker lease and blocks the chat's FIFO group. The function form
// makes an abort throw; a plain signal resolves it as a fake "Aborted" result.
const REDIS_REQUEST_TIMEOUT_MS = 5_000

let redisClient: Redis | null = null

export function isUpstashConfigured(): boolean {
  // Bun loads .env automatically during tests. Never let a unit test consume
  // commands from the real Upstash database just because local credentials
  // happen to be present.
  if (process.env.NODE_ENV === 'test') {
    return false
  }

  return Boolean(
    process.env.UPSTASH_REDIS_URL && process.env.UPSTASH_REDIS_TOKEN,
  )
}

export function getRedisClient(): Redis | null {
  if (!isUpstashConfigured()) {
    return null
  }

  if (redisClient) {
    return redisClient
  }

  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_URL || '',
    token: process.env.UPSTASH_REDIS_TOKEN || '',
    signal: () => AbortSignal.timeout(REDIS_REQUEST_TIMEOUT_MS),
  })

  return redisClient
}
