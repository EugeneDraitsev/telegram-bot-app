import { logger } from '../logger'
import { TtlCache } from '../ttl-cache'
import { getRedisClient } from './client'

const DYNAMIC_TOOLS_PREFIX = 'agent-dynamic-tools'
const DYNAMIC_TOOLS_GLOBAL_SCOPE = 'global'
export const DYNAMIC_TOOLS_CACHE_TTL_MS = 60_000

const dynamicToolsCache = new TtlCache<string, unknown[]>(
  DYNAMIC_TOOLS_CACHE_TTL_MS,
)

export function clearDynamicToolsCache(): void {
  dynamicToolsCache.clear()
}

type DynamicToolsScope = string | number | undefined

/**
 * Redis payload can be either:
 * - array of tool definitions
 * - object: { tools: [...] }
 *
 * Keys:
 * - `${prefix}:global` for shared tools
 * - `${prefix}:${chatId}` for chat-specific tools
 */

function getDynamicToolsKey(scope?: DynamicToolsScope): string {
  const scopeKey = scope ?? DYNAMIC_TOOLS_GLOBAL_SCOPE
  return `${DYNAMIC_TOOLS_PREFIX}:${scopeKey}`
}

function parseDynamicToolsPayload(value: unknown): unknown[] {
  if (!value) {
    return []
  }

  if (Array.isArray(value)) {
    return value
  }

  if (
    value &&
    typeof value === 'object' &&
    'tools' in value &&
    Array.isArray((value as { tools: unknown[] }).tools)
  ) {
    return (value as { tools: unknown[] }).tools
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed
      }

      if (
        parsed &&
        typeof parsed === 'object' &&
        'tools' in parsed &&
        Array.isArray((parsed as { tools: unknown[] }).tools)
      ) {
        return (parsed as { tools: unknown[] }).tools
      }

      return []
    } catch {
      return []
    }
  }

  return []
}

export async function getDynamicToolsRaw(
  chatId?: string | number,
): Promise<unknown[]> {
  const [globalData, chatData] = await Promise.all([
    getDynamicToolsRawByScope(),
    chatId === undefined
      ? Promise.resolve([])
      : getDynamicToolsRawByScope(chatId),
  ])

  return [...globalData, ...chatData]
}

export async function getDynamicToolsRawByScope(
  scope?: string | number,
): Promise<unknown[]> {
  const redis = getRedisClient()
  if (!redis) {
    return []
  }

  const key = getDynamicToolsKey(scope)
  const cached = dynamicToolsCache.get(key)
  if (cached !== undefined) {
    return [...cached]
  }

  try {
    const rawData = await redis.get<unknown>(key)
    const tools = parseDynamicToolsPayload(rawData)
    dynamicToolsCache.set(key, tools)
    return [...tools]
  } catch (error) {
    logger.error({ error }, 'Error getting dynamic tools')
    return []
  }
}

export async function saveDynamicToolsRaw(
  tools: unknown[],
  chatId?: string | number,
): Promise<boolean> {
  const redis = getRedisClient()
  if (!redis) {
    return false
  }

  try {
    const key = getDynamicToolsKey(chatId)
    await redis.set(key, JSON.stringify(tools))
    dynamicToolsCache.set(key, [...tools])
    return true
  } catch (error) {
    logger.error({ error }, 'Error saving dynamic tools')
    return false
  }
}
