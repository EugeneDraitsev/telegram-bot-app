import type {
  APIGatewayProxyEvent,
  APIGatewayProxyHandler,
  APIGatewayProxyResult,
} from 'aws-lambda'

import {
  CHAT_CONFIGURATION_TABLE_NAME,
  CHAT_USER_STATISTICS_TABLE_NAME,
  type ChatConfiguration,
  type ChatConfigurationFlagsPatch,
  dynamoScanAll,
  logger,
  setChatConfigurationFlags,
} from '@tg-bot/common'
import { TtlCache } from '../common/ttl-cache'
import {
  ADMIN_SESSION_TTL_SECONDS,
  AdminAuthError,
  type AdminIdentity,
  createAdminSessionFromTelegram,
  verifyAdminSession,
} from './auth'

interface StoredChatDirectoryRow {
  chatId?: unknown
  chatInfo?: unknown
  updatedAt?: unknown
}

const CHAT_DIRECTORY_CACHE_TTL_MS = 60_000
const CHAT_DIRECTORY_CACHE_KEY = 'chat-directory'
const chatDirectoryCache = new TtlCache<
  typeof CHAT_DIRECTORY_CACHE_KEY,
  StoredChatDirectoryRow[]
>(CHAT_DIRECTORY_CACHE_TTL_MS, 1)

interface TelegramChatInfo {
  id?: number
  type?: string
  title?: string
  username?: string
  first_name?: string
  last_name?: string
}

export interface AdminChatRecord extends ChatConfiguration {
  configured: boolean
  name: string
  username?: string
  type?: string
  lastActivityAt?: number
}

interface ChatDirectoryEntry {
  chatId: string
  chatInfo?: TelegramChatInfo
  updatedAt?: number
}

const json = (statusCode: number, value: unknown): APIGatewayProxyResult => ({
  statusCode,
  headers: {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify(value),
})

function parseJsonBody(event: APIGatewayProxyEvent): unknown {
  if (!event.body) return undefined
  try {
    return JSON.parse(event.body)
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseChatInfo(value: unknown): TelegramChatInfo | undefined {
  return isRecord(value) ? (value as TelegramChatInfo) : undefined
}

function getChatName(chatId: string, chatInfo?: TelegramChatInfo): string {
  if (chatInfo?.title?.trim()) return chatInfo.title.trim()
  const privateName = [chatInfo?.first_name, chatInfo?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  if (privateName) return privateName
  if (chatInfo?.username?.trim()) return `@${chatInfo.username.trim()}`
  return `Chat ${chatId}`
}

function normalizeConfiguration(value: unknown): ChatConfiguration | undefined {
  if (!isRecord(value) || typeof value.chatId !== 'string') return undefined
  return {
    chatId: value.chatId,
    aiAllowed: value.aiAllowed === true,
    agenticEnabled: value.agenticEnabled === true,
    version:
      typeof value.version === 'number' && Number.isFinite(value.version)
        ? value.version
        : 0,
    allowUpdatedAt:
      typeof value.allowUpdatedAt === 'number'
        ? value.allowUpdatedAt
        : undefined,
    allowUpdatedBy:
      typeof value.allowUpdatedBy === 'number'
        ? value.allowUpdatedBy
        : undefined,
    toggledAt:
      typeof value.toggledAt === 'number' ? value.toggledAt : undefined,
    toggledBy:
      typeof value.toggledBy === 'number' ? value.toggledBy : undefined,
  }
}

export function mergeAdminChats(
  rawConfigurations: unknown[],
  rawDirectoryRows: StoredChatDirectoryRow[],
): AdminChatRecord[] {
  const configurations = new Map<string, ChatConfiguration>()
  for (const value of rawConfigurations) {
    const configuration = normalizeConfiguration(value)
    if (configuration) configurations.set(configuration.chatId, configuration)
  }

  const directory = new Map<string, ChatDirectoryEntry>()
  for (const row of rawDirectoryRows) {
    if (typeof row.chatId !== 'string') continue
    const updatedAt =
      typeof row.updatedAt === 'number' ? row.updatedAt : undefined
    const current = directory.get(row.chatId)
    if (!current || (updatedAt ?? 0) >= (current.updatedAt ?? 0)) {
      directory.set(row.chatId, {
        chatId: row.chatId,
        chatInfo: parseChatInfo(row.chatInfo),
        updatedAt,
      })
    }
  }

  const chatIds = new Set([...configurations.keys(), ...directory.keys()])
  return Array.from(chatIds, (chatId): AdminChatRecord => {
    const configuration = configurations.get(chatId)
    const directoryEntry = directory.get(chatId)
    const chatInfo = directoryEntry?.chatInfo
    return {
      chatId,
      aiAllowed: configuration?.aiAllowed ?? false,
      agenticEnabled: configuration?.agenticEnabled ?? false,
      version: configuration?.version ?? 0,
      allowUpdatedAt: configuration?.allowUpdatedAt,
      allowUpdatedBy: configuration?.allowUpdatedBy,
      toggledAt: configuration?.toggledAt,
      toggledBy: configuration?.toggledBy,
      configured: Boolean(configuration),
      name: getChatName(chatId, chatInfo),
      username: chatInfo?.username,
      type: chatInfo?.type,
      lastActivityAt: directoryEntry?.updatedAt,
    }
  }).sort(
    (left, right) =>
      (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0) ||
      left.name.localeCompare(right.name),
  )
}

async function requireAdmin(
  event: APIGatewayProxyEvent,
): Promise<AdminIdentity> {
  const authorization =
    event.headers.authorization ?? event.headers.Authorization ?? ''
  const bearerPrefix = 'bearer '
  if (
    authorization.slice(0, bearerPrefix.length).toLowerCase() !== bearerPrefix
  ) {
    throw new AdminAuthError('Admin session is missing')
  }

  const token = authorization.slice(bearerPrefix.length).trim()
  if (!token) throw new AdminAuthError('Admin session is missing')
  return verifyAdminSession(token)
}

async function createSession(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const body = parseJsonBody(event)
  if (
    !isRecord(body) ||
    typeof body.idToken !== 'string' ||
    typeof body.nonce !== 'string'
  ) {
    return json(400, { error: 'Telegram login data is required' })
  }

  const { token, identity } = await createAdminSessionFromTelegram(
    body.idToken,
    body.nonce,
  )
  return json(200, {
    token,
    expiresIn: ADMIN_SESSION_TTL_SECONDS,
    admin: identity,
  })
}

async function listChats(admin: AdminIdentity): Promise<APIGatewayProxyResult> {
  const [configurations, directoryRows] = await Promise.all([
    dynamoScanAll({ TableName: CHAT_CONFIGURATION_TABLE_NAME }),
    loadChatDirectoryRows(),
  ])
  return json(200, {
    admin,
    chats: mergeAdminChats(configurations, directoryRows),
  })
}

async function loadChatDirectoryRows(): Promise<StoredChatDirectoryRow[]> {
  const cached = chatDirectoryCache.get(CHAT_DIRECTORY_CACHE_KEY)
  if (cached) return cached

  const rows = await dynamoScanAll<StoredChatDirectoryRow>({
    TableName: CHAT_USER_STATISTICS_TABLE_NAME,
    ProjectionExpression: 'chatId, chatInfo, updatedAt',
  })
  chatDirectoryCache.set(CHAT_DIRECTORY_CACHE_KEY, rows)
  return rows
}

function parsePatchBody(value: unknown):
  | {
      patch: ChatConfigurationFlagsPatch
      version: number
    }
  | undefined {
  if (
    !isRecord(value) ||
    !Number.isInteger(value.version) ||
    Number(value.version) < 0
  ) {
    return undefined
  }
  const patch: ChatConfigurationFlagsPatch = {}
  if (typeof value.aiAllowed === 'boolean') patch.aiAllowed = value.aiAllowed
  if (typeof value.agenticEnabled === 'boolean') {
    patch.agenticEnabled = value.agenticEnabled
  }
  if (
    typeof patch.aiAllowed !== 'boolean' &&
    typeof patch.agenticEnabled !== 'boolean'
  ) {
    return undefined
  }
  return { patch, version: value.version as number }
}

async function updateChat(
  event: APIGatewayProxyEvent,
  admin: AdminIdentity,
): Promise<APIGatewayProxyResult> {
  const chatId = event.pathParameters?.chatId
  if (!chatId || !/^-?[1-9]\d*$/.test(chatId)) {
    return json(400, { error: 'A valid numeric chat ID is required' })
  }
  const input = parsePatchBody(parseJsonBody(event))
  if (!input)
    return json(400, { error: 'A valid flag and version are required' })

  const updatedBy = Number(admin.id)
  if (!Number.isSafeInteger(updatedBy)) {
    return json(403, { error: 'Admin Telegram ID is invalid' })
  }

  const result = await setChatConfigurationFlags(
    chatId,
    input.patch,
    updatedBy,
    input.version,
  )
  if (!result.configuration) {
    return json(result.conflict ? 409 : 400, {
      error: result.error ?? 'Could not update chat configuration',
    })
  }
  return json(200, { configuration: result.configuration })
}

export async function handleAdminApi(
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  const method = event.httpMethod.toUpperCase()
  const resource = event.resource || event.path

  try {
    if (method === 'POST' && resource === '/admin/session') {
      return await createSession(event)
    }

    const admin = await requireAdmin(event)
    if (method === 'GET' && resource === '/admin/chats') {
      return await listChats(admin)
    }
    if (method === 'PATCH' && resource === '/admin/chats/{chatId}') {
      return await updateChat(event, admin)
    }
    return json(404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return json(error.statusCode, { error: error.message })
    }
    logger.error({ method, resource, error }, 'admin_api.failed')
    return json(500, { error: 'Admin API request failed' })
  }
}

export default handleAdminApi satisfies APIGatewayProxyHandler
