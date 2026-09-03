import { randomUUID } from 'node:crypto'

import { logger } from '../../logger'
import { TtlCache } from '../../ttl-cache'
import {
  dynamoGetItem,
  dynamoUpdateItem,
  getOptionalEnv,
  isOffline,
} from '../../utils'
import { CHAT_CONFIGURATION_TABLE_NAME } from './table-names'

// Keep disabled chats out of SQS while making owner/admin changes visible
// across warm ingress and worker instances within a few seconds.
export const CHAT_CONFIGURATION_CACHE_TTL_MS = 5_000
const TOGGLE_MAX_ATTEMPTS = 3
const CHAT_CONFIGURATION_UPDATE_ERROR =
  'Could not update chat configuration; please try again'
const CHAT_CONFIGURATION_CONFLICT_ERROR =
  'Chat configuration changed; refresh and try again'

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
  lastToggleOperationId?: string
}

export interface ChatConfigurationUpdateResult {
  configuration?: ChatConfiguration
  error?: string
  conflict?: boolean
}

export interface ChatConfigurationFlagsPatch {
  aiAllowed?: boolean
  agenticEnabled?: boolean
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

// Serverless Offline intentionally opens only the read gates so webhook
// fixtures work without a production chat-configuration table. Configuration
// update functions below still use DynamoDB.
export async function isAiAllowedChat(
  chatId?: string | number,
): Promise<boolean> {
  if (isOffline()) {
    return true
  }

  return (await getChatConfiguration(chatId))?.aiAllowed === true
}

export async function isAgenticChatEnabled(
  chatId?: string | number,
): Promise<boolean> {
  if (!isAgenticBotGloballyEnabled()) {
    return false
  }
  if (isOffline()) {
    return true
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

type ExpectedChatConfiguration = Partial<
  Pick<
    ChatConfiguration,
    'aiAllowed' | 'agenticEnabled' | 'lastToggleOperationId'
  >
>

/**
 * A failed UpdateItem response does not mean the write was lost: the update
 * may have committed server-side while our abort fired first. Re-read once
 * with a consistent read and report success when the requested state is now
 * visible. Versioned writes must also advance beyond the attempted base.
 */
async function reconcileChatConfigurationWrite(
  chatId: string | number,
  expected: ExpectedChatConfiguration,
  baseVersion?: number,
): Promise<ChatConfiguration | undefined> {
  try {
    const latest = await readChatConfiguration(chatId)
    if (
      (baseVersion !== undefined && latest.version <= baseVersion) ||
      (expected.aiAllowed !== undefined &&
        latest.aiAllowed !== expected.aiAllowed) ||
      (expected.agenticEnabled !== undefined &&
        latest.agenticEnabled !== expected.agenticEnabled) ||
      (expected.lastToggleOperationId !== undefined &&
        latest.lastToggleOperationId !== expected.lastToggleOperationId)
    ) {
      return undefined
    }
    return latest
  } catch {
    return undefined
  }
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
    const reconciled = await reconcileChatConfigurationWrite(
      chatId,
      aiAllowed ? { aiAllowed } : { aiAllowed, agenticEnabled: false },
    )
    if (reconciled) {
      configurationCache.set(cacheKey, reconciled)
      return { configuration: reconciled }
    }

    logger.error(
      { chatId, aiAllowed, error },
      'chat_configuration.allow_failed',
    )
    return { error: CHAT_CONFIGURATION_UPDATE_ERROR }
  }
}

/**
 * Set owner-controlled chat flags to explicit values for the admin API.
 * The write is optimistic and preserves the same invariant as /disallowai:
 * a disallowed chat can never remain agentic-enabled.
 */
export async function setChatConfigurationFlags(
  chatId: string | number,
  patch: ChatConfigurationFlagsPatch,
  updatedBy: number,
  expectedVersion?: number,
): Promise<ChatConfigurationUpdateResult> {
  if (
    typeof patch.aiAllowed !== 'boolean' &&
    typeof patch.agenticEnabled !== 'boolean'
  ) {
    return { error: 'At least one chat configuration flag is required' }
  }

  if (patch.agenticEnabled === true && !isAgenticBotGloballyEnabled()) {
    return { error: 'AI is globally disabled' }
  }

  const cacheKey = String(chatId)
  for (let attempt = 0; attempt < TOGGLE_MAX_ATTEMPTS; attempt += 1) {
    let attempted:
      | { version: number; expected: ExpectedChatConfiguration }
      | undefined
    try {
      const current = await readChatConfiguration(chatId)
      if (
        expectedVersion !== undefined &&
        current.version !== expectedVersion
      ) {
        return { error: CHAT_CONFIGURATION_CONFLICT_ERROR, conflict: true }
      }

      const aiAllowed = patch.aiAllowed ?? current.aiAllowed
      if (patch.agenticEnabled === true && !aiAllowed) {
        return {
          error: 'Allow AI access before enabling the agentic bot',
        }
      }

      const agenticEnabled = aiAllowed
        ? (patch.agenticEnabled ?? current.agenticEnabled)
        : false
      const aiAllowedChanged = aiAllowed !== current.aiAllowed
      const agenticEnabledChanged = agenticEnabled !== current.agenticEnabled

      if (!aiAllowedChanged && !agenticEnabledChanged) {
        configurationCache.set(cacheKey, current)
        return { configuration: current }
      }
      attempted = {
        version: current.version,
        expected: { aiAllowed, agenticEnabled },
      }

      const now = Date.now()
      const updateExpressionParts = [
        'aiAllowed = :aiAllowed',
        'agenticEnabled = :agenticEnabled',
        '#version = :nextVersion',
      ]
      const expressionAttributeValues: Record<string, boolean | number> = {
        ':aiAllowed': aiAllowed,
        ':agenticEnabled': agenticEnabled,
        ':expectedVersion': current.version,
        ':nextVersion': current.version + 1,
      }

      if (aiAllowedChanged) {
        updateExpressionParts.push(
          'allowUpdatedAt = :now',
          'allowUpdatedBy = :updatedBy',
        )
      }
      if (agenticEnabledChanged) {
        updateExpressionParts.push('toggledAt = :now', 'toggledBy = :updatedBy')
      }
      if (aiAllowedChanged || agenticEnabledChanged) {
        expressionAttributeValues[':now'] = now
        expressionAttributeValues[':updatedBy'] = updatedBy
      }

      const result = await dynamoUpdateItem({
        TableName: CHAT_CONFIGURATION_TABLE_NAME,
        Key: { chatId: cacheKey },
        UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
        ConditionExpression:
          'attribute_not_exists(#version) OR #version = :expectedVersion',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      })
      const configuration = normalizeChatConfiguration(
        chatId,
        result.Attributes as Partial<ChatConfiguration> | undefined,
      )
      configurationCache.set(cacheKey, configuration)
      return { configuration }
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        continue
      }

      const reconciled = attempted
        ? await reconcileChatConfigurationWrite(
            chatId,
            attempted.expected,
            attempted.version,
          )
        : undefined
      if (reconciled) {
        configurationCache.set(cacheKey, reconciled)
        return { configuration: reconciled }
      }

      logger.error({ chatId, patch, error }, 'chat_configuration.admin_failed')
      return { error: CHAT_CONFIGURATION_UPDATE_ERROR }
    }
  }

  return { error: CHAT_CONFIGURATION_CONFLICT_ERROR, conflict: true }
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
    let attempted:
      | { version: number; enabled: boolean; operationId: string }
      | undefined
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
      const operationId = randomUUID()
      attempted = { version: current.version, enabled, operationId }
      const now = Date.now()
      const updateExpressionParts = [
        'agenticEnabled = :enabled',
        'toggledAt = :now',
        'lastToggleOperationId = :operationId',
        '#version = :nextVersion',
      ]
      const expressionAttributeValues: Record<
        string,
        boolean | number | string
      > = {
        ':allowed': true,
        ':enabled': enabled,
        ':now': now,
        ':operationId': operationId,
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
        lastToggleOperationId: operationId,
        ...(updatedBy === undefined ? {} : { toggledBy: updatedBy }),
      })
      return { enabled }
    } catch (error) {
      if (isConditionalCheckFailure(error)) {
        continue
      }

      const reconciled = attempted
        ? await reconcileChatConfigurationWrite(
            chatId,
            {
              agenticEnabled: attempted.enabled,
              lastToggleOperationId: attempted.operationId,
            },
            attempted.version,
          )
        : undefined
      if (attempted && reconciled) {
        configurationCache.set(cacheKey, reconciled)
        return { enabled: attempted.enabled }
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
