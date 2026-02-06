import { getRedisClient } from './client'

const DYNAMIC_TOOLS_PREFIX = 'agent-dynamic-tools'
const DYNAMIC_TOOLS_GLOBAL_SCOPE = 'global'
const DYNAMIC_TOOLS_TTL_SECONDS = 60 * 60 * 24 * 30

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
    typeof value === 'object' &&
    value !== null &&
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
        typeof parsed === 'object' &&
        parsed !== null &&
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
  const redis = getRedisClient()
  if (!redis) {
    return []
  }

  try {
    const [globalData, chatData] = await Promise.all([
      redis.get<unknown>(getDynamicToolsKey()),
      chatId === undefined
        ? Promise.resolve(undefined)
        : redis.get<unknown>(getDynamicToolsKey(chatId)),
    ])

    return [
      ...parseDynamicToolsPayload(globalData),
      ...parseDynamicToolsPayload(chatData),
    ]
  } catch (error) {
    console.error('Error getting dynamic tools:', error)
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
    await redis.set(getDynamicToolsKey(chatId), JSON.stringify(tools), {
      ex: DYNAMIC_TOOLS_TTL_SECONDS,
    })
    return true
  } catch (error) {
    console.error('Error saving dynamic tools:', error)
    return false
  }
}
