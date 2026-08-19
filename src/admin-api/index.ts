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
  createStatisticsAccessToken,
  dynamoScanAll,
  getStoredUserChats,
  hasStoredChat,
  hasStoredChatUser,
  isBotOwner,
  logger,
  setChatConfigurationFlags,
  TtlCache,
} from '@tg-bot/common'
import {
  createSessionFromTelegram,
  SESSION_TTL_SECONDS,
  SessionAuthError,
  type SessionIdentity,
  verifySession,
} from './auth'

interface StoredChatDirectoryRow {
  chatId?: unknown
  chatInfo?: unknown
  updatedAt?: unknown
}

const CHAT_DIRECTORY_CACHE_TTL_MS = 60_000
const CHAT_DIRECTORY_CACHE_KEY = 'chat-directory'
const CHAT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60
const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 100
const PAGE_SIZES = new Set([10, 20, 50, 100])
const chatDirectoryCache = new TtlCache<
  typeof CHAT_DIRECTORY_CACHE_KEY,
  StoredChatDirectoryRow[]
>(CHAT_DIRECTORY_CACHE_TTL_MS, 1)

export type AdminChatSortKey = 'name' | 'lastActivityAt' | 'aiAccess' | 'agent'
export type SortDirection = 'asc' | 'desc'
export type AiAccessFilter = 'all' | 'allowed' | 'blocked'

export interface AdminChatListOptions {
  page: number
  pageSize: number
  q: string
  aiAccess: AiAccessFilter
  sort: AdminChatSortKey
  direction: SortDirection
}

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

export interface UserChatRecord {
  chatId: string
  name: string
  username?: string
  type?: string
  lastActivityAt?: number
  messageCount: number
}

export interface AdminChatPage {
  chats: AdminChatRecord[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
  summary: {
    total: number
    allowed: number
    enabled: number
  }
  query: AdminChatListOptions
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

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback
}

export function parseAdminChatListOptions(
  params: APIGatewayProxyEvent['queryStringParameters'],
): AdminChatListOptions {
  const aiAccess = params?.aiAccess
  const sort = params?.sort
  const direction = params?.direction
  const requestedPageSize = parsePositiveInteger(
    params?.pageSize,
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
  )
  return {
    page: parsePositiveInteger(params?.page, 1),
    pageSize: PAGE_SIZES.has(requestedPageSize)
      ? requestedPageSize
      : DEFAULT_PAGE_SIZE,
    q: params?.q?.trim().slice(0, 100) ?? '',
    aiAccess:
      aiAccess === 'allowed' || aiAccess === 'blocked' ? aiAccess : 'all',
    sort:
      sort === 'name' ||
      sort === 'aiAccess' ||
      sort === 'agent' ||
      sort === 'lastActivityAt'
        ? sort
        : 'lastActivityAt',
    direction: direction === 'asc' ? 'asc' : 'desc',
  }
}

function compareAdminChats(
  left: AdminChatRecord,
  right: AdminChatRecord,
  sort: AdminChatSortKey,
): number {
  if (sort === 'name') {
    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  }
  if (sort === 'aiAccess') {
    return Number(left.aiAllowed) - Number(right.aiAllowed)
  }
  if (sort === 'agent') {
    return Number(left.agenticEnabled) - Number(right.agenticEnabled)
  }
  return (left.lastActivityAt ?? 0) - (right.lastActivityAt ?? 0)
}

export function paginateAdminChats(
  chats: AdminChatRecord[],
  options: AdminChatListOptions,
): AdminChatPage {
  const normalizedQuery = options.q.toLocaleLowerCase()
  const filtered = chats.filter((chat) => {
    if (options.aiAccess === 'allowed' && !chat.aiAllowed) {
      return false
    }
    if (options.aiAccess === 'blocked' && chat.aiAllowed) return false
    if (!normalizedQuery) return true
    return [
      chat.name,
      chat.username,
      chat.username ? `@${chat.username}` : undefined,
      chat.chatId,
      chat.type,
    ].some((value) => value?.toLocaleLowerCase().includes(normalizedQuery))
  })

  filtered.sort((left, right) => {
    const comparison = compareAdminChats(left, right, options.sort)
    if (comparison !== 0) {
      return options.direction === 'asc' ? comparison : -comparison
    }
    return (
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      }) || left.chatId.localeCompare(right.chatId)
    )
  })

  const total = filtered.length
  const totalPages = Math.max(1, Math.ceil(total / options.pageSize))
  const page = Math.min(options.page, totalPages)
  const offset = (page - 1) * options.pageSize
  return {
    chats: filtered.slice(offset, offset + options.pageSize),
    pagination: { page, pageSize: options.pageSize, total, totalPages },
    summary: {
      total: chats.length,
      allowed: chats.filter((chat) => chat.aiAllowed).length,
      enabled: chats.filter((chat) => chat.aiAllowed && chat.agenticEnabled)
        .length,
    },
    query: { ...options, page },
  }
}

async function requireSession(
  event: APIGatewayProxyEvent,
): Promise<SessionIdentity> {
  const authorization =
    event.headers.authorization ?? event.headers.Authorization ?? ''
  const bearerPrefix = 'bearer '
  if (
    authorization.slice(0, bearerPrefix.length).toLowerCase() !== bearerPrefix
  ) {
    throw new SessionAuthError('Telegram session is missing')
  }

  const token = authorization.slice(bearerPrefix.length).trim()
  if (!token) throw new SessionAuthError('Telegram session is missing')
  return verifySession(token)
}

function requireAdmin(identity: SessionIdentity): SessionIdentity {
  if (!isBotOwner(identity.id)) {
    throw new SessionAuthError('Bot owner access is required', 403)
  }
  return identity
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

  const { token, identity } = await createSessionFromTelegram(
    body.idToken,
    body.nonce,
  )
  return json(200, {
    token,
    expiresIn: SESSION_TTL_SECONDS,
    user: { ...identity, isAdmin: isBotOwner(identity.id) },
  })
}

async function listChats(
  event: APIGatewayProxyEvent,
  admin: SessionIdentity,
): Promise<APIGatewayProxyResult> {
  const [configurations, directoryRows] = await Promise.all([
    dynamoScanAll({ TableName: CHAT_CONFIGURATION_TABLE_NAME }),
    loadChatDirectoryRows(),
  ])
  const page = paginateAdminChats(
    mergeAdminChats(configurations, directoryRows),
    parseAdminChatListOptions(event.queryStringParameters),
  )
  return json(200, {
    admin,
    ...page,
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

function getNumericUserId(identity: SessionIdentity): number {
  const userId = Number(identity.id)
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new SessionAuthError('Telegram user ID is invalid', 403)
  }
  return userId
}

async function listUserChats(
  identity: SessionIdentity,
): Promise<APIGatewayProxyResult> {
  const chats = (await getStoredUserChats(getNumericUserId(identity))).map(
    (chat): UserChatRecord => ({
      chatId: chat.chatId,
      name: getChatName(chat.chatId, chat.chatInfo),
      username: chat.chatInfo?.username,
      type: chat.chatInfo?.type,
      lastActivityAt: chat.lastActivityAt,
      messageCount: chat.messageCount,
    }),
  )
  return json(200, {
    user: { ...identity, isAdmin: isBotOwner(identity.id) },
    chats,
  })
}

async function createChatAccess(
  event: APIGatewayProxyEvent,
  identity: SessionIdentity,
): Promise<APIGatewayProxyResult> {
  const chatId = event.pathParameters?.chatId
  if (!chatId || !/^-?[1-9]\d*$/.test(chatId)) {
    return json(400, { error: 'A valid numeric chat ID is required' })
  }

  const canAccess = isBotOwner(identity.id)
    ? await hasStoredChat(chatId)
    : await hasStoredChatUser(chatId, getNumericUserId(identity))
  if (!canAccess) {
    throw new SessionAuthError('This chat is not available to this user', 403)
  }

  return json(200, {
    chatId,
    accessToken: createStatisticsAccessToken(
      chatId,
      Date.now(),
      CHAT_ACCESS_TOKEN_TTL_SECONDS,
    ),
    expiresIn: CHAT_ACCESS_TOKEN_TTL_SECONDS,
  })
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
  admin: SessionIdentity,
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
    if (
      method === 'POST' &&
      (resource === '/session' || resource === '/admin/session')
    ) {
      return await createSession(event)
    }

    const identity = await requireSession(event)
    if (method === 'GET' && resource === '/chats') {
      return await listUserChats(identity)
    }
    if (method === 'GET' && resource === '/chats/{chatId}/access') {
      return await createChatAccess(event, identity)
    }

    const admin = requireAdmin(identity)
    if (method === 'GET' && resource === '/admin/chats') {
      return await listChats(event, admin)
    }
    if (method === 'PATCH' && resource === '/admin/chats/{chatId}') {
      return await updateChat(event, admin)
    }
    return json(404, { error: 'Not found' })
  } catch (error) {
    if (error instanceof SessionAuthError) {
      return json(error.statusCode, { error: error.message })
    }
    logger.error({ method, resource, error }, 'admin_api.failed')
    return json(500, { error: 'Admin API request failed' })
  }
}

export default handleAdminApi satisfies APIGatewayProxyHandler
