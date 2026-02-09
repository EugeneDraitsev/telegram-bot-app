import { Redis } from '@upstash/redis'

let redisClient: Redis | null = null

export function isUpstashConfigured(): boolean {
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
  })

  return redisClient
}
