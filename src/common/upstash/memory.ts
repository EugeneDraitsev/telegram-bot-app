/**
 * Agent memory stored in Upstash Redis as markdown text.
 *
 * Two scopes:
 * - **chat** (`memory:chat:<chatId>`) — per-chat notes the agent keeps about
 *   users, preferences, running jokes, etc.
 * - **global** (`memory:global`) — cross-chat knowledge: facts, policies,
 *   self-improvement notes, etc.
 *
 * Both values are plain markdown strings. TTL is 90 days (refreshed on every write).
 */

import { getRedisClient } from './client'

export const MEMORY_PREFIX = 'memory'
export const MEMORY_GLOBAL_KEY = `${MEMORY_PREFIX}:global`
export const MEMORY_TTL_SECONDS = 60 * 60 * 24 * 90 // 90 days
export const MEMORY_MAX_LENGTH = 50_000 // ~50 KB

export function chatMemoryKey(chatId: string | number): string {
  return `${MEMORY_PREFIX}:chat:${chatId}`
}

/**
 * Read chat-scoped memory (markdown string or empty).
 */
export async function getChatMemory(chatId: string | number): Promise<string> {
  const redis = getRedisClient()
  if (!redis) return ''

  try {
    const value = await redis.get<string>(chatMemoryKey(chatId))
    return value ?? ''
  } catch (error) {
    console.error('Error getting chat memory:', error)
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
    await redis.set(chatMemoryKey(chatId), trimmed, {
      ex: MEMORY_TTL_SECONDS,
    })
    return true
  } catch (error) {
    console.error('Error saving chat memory:', error)
    return false
  }
}

/**
 * Read global memory (markdown string or empty).
 */
export async function getGlobalMemory(): Promise<string> {
  const redis = getRedisClient()
  if (!redis) return ''

  try {
    const value = await redis.get<string>(MEMORY_GLOBAL_KEY)
    return value ?? ''
  } catch (error) {
    console.error('Error getting global memory:', error)
    return ''
  }
}

/**
 * Write / overwrite global memory.
 * Returns false if content is empty or exceeds max length.
 */
export async function setGlobalMemory(content: string): Promise<boolean> {
  const trimmed = content.trim()
  if (!trimmed) return false
  if (trimmed.length > MEMORY_MAX_LENGTH) return false

  const redis = getRedisClient()
  if (!redis) return false

  try {
    await redis.set(MEMORY_GLOBAL_KEY, trimmed, {
      ex: MEMORY_TTL_SECONDS,
    })
    return true
  } catch (error) {
    console.error('Error saving global memory:', error)
    return false
  }
}
