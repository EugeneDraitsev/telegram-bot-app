/**
 * Agent memory stored in Upstash Redis as markdown text.
 *
 * Two scopes:
 * - **chat** (`memory:chat:<chatId>`) — per-chat notes the agent keeps about
 *   users, preferences, running jokes, etc.
 * - **global** (`memory:global`) — cross-chat knowledge: facts, policies,
 *   self-improvement notes, etc.
 *
 * Values are plain markdown strings. Chat-scoped memory is stored permanently.
 * Global memory is read-only here — it is seeded out of band, and the
 * `update_memory` tool deliberately only writes the chat scope.
 */

import { logger } from '../logger'
import { TtlCache } from '../ttl-cache'
import { getRedisClient } from './client'

export const MEMORY_PREFIX = 'memory'
export const MEMORY_GLOBAL_KEY = `${MEMORY_PREFIX}:global`
export const MEMORY_MAX_LENGTH = 50_000 // ~50 KB
export const MEMORY_CACHE_TTL_MS = 60_000

const memoryCache = new TtlCache<string, string>(MEMORY_CACHE_TTL_MS)

export function clearMemoryCache(): void {
  memoryCache.clear()
}

export function chatMemoryKey(chatId: string | number): string {
  return `${MEMORY_PREFIX}:chat:${chatId}`
}

/**
 * Read chat-scoped memory (markdown string or empty).
 */
export async function getChatMemory(chatId: string | number): Promise<string> {
  const redis = getRedisClient()
  if (!redis) return ''

  const key = chatMemoryKey(chatId)
  const cached = memoryCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  try {
    const value = (await redis.get<string>(key)) ?? ''
    memoryCache.set(key, value)
    return value
  } catch (error) {
    logger.error({ error }, 'Error getting chat memory')
    return ''
  }
}

/**
 * Write / overwrite chat-scoped memory.
 * Returns false if content is empty or exceeds max length.
 */
export async function setChatMemory(
  chatId: string | number,
  content: string,
): Promise<boolean> {
  const trimmed = content.trim()
  if (!trimmed) return false
  if (trimmed.length > MEMORY_MAX_LENGTH) return false

  const redis = getRedisClient()
  if (!redis) return false

  try {
    const key = chatMemoryKey(chatId)
    await redis.set(key, trimmed)
    memoryCache.set(key, trimmed)
    return true
  } catch (error) {
    logger.error({ error }, 'Error saving chat memory')
    return false
  }
}

/**
 * Read global memory (markdown string or empty).
 */
export async function getGlobalMemory(): Promise<string> {
  const redis = getRedisClient()
  if (!redis) return ''

  const cached = memoryCache.get(MEMORY_GLOBAL_KEY)
  if (cached !== undefined) {
    return cached
  }

  try {
    const value = (await redis.get<string>(MEMORY_GLOBAL_KEY)) ?? ''
    memoryCache.set(MEMORY_GLOBAL_KEY, value)
    return value
  } catch (error) {
    logger.error({ error }, 'Error getting global memory')
    return ''
  }
}
