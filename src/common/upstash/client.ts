import { Redis } from '@upstash/redis'

const redisUrl = process.env.UPSTASH_REDIS_URL
const redisToken = process.env.UPSTASH_REDIS_TOKEN

let redisClient: Redis | null = null

export function isUpstashConfigured(): boolean {
  return Boolean(redisUrl && redisToken)
}

export function getRedisClient(): Redis | null {
  if (!isUpstashConfigured()) {
    return null
  }

  if (redisClient) {
    return redisClient
  }

  redisClient = new Redis({
    url: redisUrl || '',
    token: redisToken || '',
  })

  return redisClient
}
