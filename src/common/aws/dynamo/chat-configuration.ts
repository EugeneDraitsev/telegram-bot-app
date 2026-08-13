import { logger } from '../../logger'
import { TtlCache } from '../../ttl-cache'
import { dynamoGetItem, dynamoUpdateItem, getOptionalEnv } from '../../utils'
import { CHAT_CONFIGURATION_TABLE_NAME } from './table-names'

// Keep disabled chats out of SQS while making owner/admin changes visible
// across warm ingress and worker instances within a few seconds.
export const CHAT_CONFIGURATION_CACHE_TTL_MS = 5_000
const TOGGLE_MAX_ATTEMPTS = 3
const CHAT_CONFIGURATION_UPDATE_ERROR =
  'Could not update chat configuration; please try again'

const configurationCache = new TtlCache<string, ChatConfiguration>(
  CHAT_CONFIGURATION_CACHE_TTL_MS,
)
const DISABLED_SWITCH_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled'])

export interface ChatConfiguration {
  chatId: string
  /** Owner-controlled outer allowlist. Chat administrators cannot change it. */
  aiAllowed: boolean
  /** Chat-admin-controlled switch changed by /toggle. */
  agenticEnabled: boolean
  version: number
  allowUpdatedAt?: number
  allowUpdatedBy?: number
  toggledAt?: number
  toggledBy?: number
}

export interface ChatConfigurationUpdateResult {
  configuration?: ChatConfiguration
  error?: string
}

export function clearChatConfigurationCache(): void {
  configurationCache.clear()
}

export function isAgenticBotGloballyEnabled(): boolean {
  const value = getOptionalEnv('AGENTIC_BOT_ENABLED')?.toLowerCase()
  return !value || !DISABLED_SWITCH_VALUES.has(value)
}

export function isBotOwner(userId?: string | number): boolean {
  const ownerId = getOptionalEnv('BOT_OWNER_ID')
  return Boolean(ownerId && userId !== undefined && String(userId) === ownerId)
}

function normalizeChatConfiguration(
  chatId: string | number,
  item?: Partial<ChatConfiguration>,
): ChatConfiguration {
  return {
    ...item,
    chatId: String(chatId),
    aiAllowed: item?.aiAllowed === true,
    agenticEnabled: item?.agenticEnabled === true,
    version:
      typeof item?.version === 'number' && Number.isFinite(item.version)
        ? item.version
        : 0,
  }
}

async function readChatConfiguration(
  chatId: string | number,
): Promise<ChatConfiguration> {
  const result = await dynamoGetItem({
    TableName: CHAT_CONFIGURATION_TABLE_NAME,
    Key: { chatId: String(chatId) },
    ConsistentRead: true,
  })
  return normalizeChatConfiguration(
    chatId,
    result.Item as Partial<ChatConfiguration> | undefined,
  )
}

export async function getChatConfiguration(
  chatId?: string | number,
): Promise<ChatConfiguration | undefined> {
  if (chatId === undefined || chatId === null || String(chatId).trim() === '') {
    return undefined
  }

  const cacheKey = String(chatId)
  const cached = configurationCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }

  try {
    // Authorization may be cached briefly, but every cache miss must observe
    // the latest committed owner/admin decision in this region.
    const configuration = await readChatConfiguration(chatId)
    configurationCache.set(cacheKey, configuration)
    return configuration
  } catch (error) {
    logger.error({ chatId, error }, 'chat_configuration.read_failed')
    return undefined
  }
}

export async function isAiAllowedChat(
  chatId?: string | number,
): Promise<boolean> {
  return (await getChatConfiguration(chatId))?.aiAllowed === true
}

export async function isAgenticChatEnabled(
  chatId?: string | number,
): Promise<boolean> {
  if (!isAgenticBotGloballyEnabled()) {
    return false
  }

  const configuration = await getChatConfiguration(chatId)
  return (
    configuration?.aiAllowed === true && configuration.agenticEnabled === true
  )
}

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConditionalCheckFailedException'
  )
}

/**
 * Change the owner-controlled outer allowlist without overwriting the
 * administrator-controlled fields. Disallowing also turns the inner switch
 * off so re-allowing a chat can never reactivate it unexpectedly.
 */
export async function setChatAiAllowed(
  chatId: string | number,
  aiAllowed: boolean,
  updatedBy: number,
): Promise<ChatConfigurationUpdateResult> {
  const cacheKey = String(chatId)
  const now = Date.now()

  try {
    const result = await dynamoUpdateItem({
      TableName: CHAT_CONFIGURATION_TABLE_NAME,
      Key: { chatId: cacheKey },
      UpdateExpression: aiAllowed
        ? 'SET aiAllowed = :allowed, agenticEnabled = if_not_exists(agenticEnabled, :disabled), allowUpdatedAt = :now, allowUpdatedBy = :updatedBy, #version = if_not_exists(#version, :zero) + :one'
        : 'SET aiAllowed = :allowed, agenticEnabled = :disabled, allowUpdatedAt = :now, allowUpdatedBy = :updatedBy, #version = if_not_exists(#version, :zero) + :one',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: {
        ':allowed': aiAllowed,
        ':disabled': false,
        ':now': now,
        ':updatedBy': updatedBy,
        ':zero': 0,
        ':one': 1,
      },
      ReturnValues: 'ALL_NEW',
    })
    const configuration = normalizeChatConfiguration(
      chatId,
      result.Attributes as Partial<ChatConfiguration> | undefined,
    )
    configurationCache.set(cacheKey, configuration)
    return { configuration }
  } catch (error) {
    logger.error(
      { chatId, aiAllowed, error },
      'chat_configuration.allow_failed',
    )
    return { error: CHAT_CONFIGURATION_UPDATE_ERROR }
  }
}

/**
 * Toggle only the chat-admin-controlled flag. An optimistic version condition
 * prevents concurrent toggles from losing an update and prevents an owner
 * disallow racing with a toggle. The caller owns Telegram admin authorization.
 */
export async function toggleAgenticChat(
  chatId: string | number,
  updatedBy?: number,
): Promise<{ enabled: boolean; error?: string }> {
  if (!isAgenticBotGloballyEnabled()) {
    return { enabled: false, error: 'AI is globally disabled' }
  }

  const cacheKey = String(chatId)
  for (let attempt = 0; attempt < TOGGLE_MAX_ATTEMPTS; attempt++) {
    try {
      const current = await readChatConfiguration(chatId)
      if (!current.aiAllowed) {
        configurationCache.set(cacheKey, current)
        return {
          enabled: false,
          error: 'This chat is not AI-allowed by the bot owner',
        }
      }

      const enabled = !current.agenticEnabled
      const now = Date.now()
      const updateExpressionParts = [
        'agenticEnabled = :enabled',
        'toggledAt = :now',
        '#version = :nextVersion',
      ]
      const expressionAttributeValues: Record<string, boolean | number> = {
        ':allowed': true,
        ':enabled': enabled,
        ':now': now,
        ':expectedVersion': current.version,
        ':nextVersion': current.version + 1,
      }
      if (updatedBy !== undefined) {
        updateExpressionParts.push('toggledBy = :updatedBy')
        expressionAttributeValues[':updatedBy'] = updatedBy
      }

      await dynamoUpdateItem({
        TableName: CHAT_CONFIGURATION_TABLE_NAME,
        Key: { chatId: cacheKey },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ConditionExpression:
          'aiAllowed = :allowed AND (attribute_not_exists(#version) OR #version = :expectedVersion)',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: expressionAttributeValues,
      })

      configurationCache.set(cacheKey, {
        ...current,
        agenticEnabled: enabled,
        version: current.version + 1,
        toggledAt: now,
        ...(updatedBy === undefined ? {} : { toggledBy: updatedBy }),
      })
      return { enabled }
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        continue
      }

      logger.error({ chatId, error }, 'chat_configuration.toggle_failed')
      return { enabled: false, error: CHAT_CONFIGURATION_UPDATE_ERROR }
    }
  }

  logger.warn({ chatId }, 'chat_configuration.toggle_conflict')
  return {
    enabled: false,
    error: 'Chat configuration changed concurrently; please try again',
  }
}
