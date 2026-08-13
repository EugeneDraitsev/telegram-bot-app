import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  DescribeContinuousBackupsCommand,
  DescribeTableCommand,
  type DescribeTableCommandOutput,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import {
  GetFunctionConfigurationCommand,
  LambdaClient,
} from '@aws-sdk/client-lambda'
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb'
import { Redis } from '@upstash/redis'

const LEGACY_AGENTIC_CHAT_CONFIG_KEY = 'bot-config:agentic-chats'
const MIGRATION_STATE = 'legacy-env-redis-v1'
const DEFAULT_REPORT_PATH = 'chat-configuration-migration-report.json'

export type MigratedChatConfiguration = {
  chatId: string
  aiAllowed: boolean
  agenticEnabled: boolean
  version: number
  allowUpdatedAt: number
  allowUpdatedBy: number
  migratedAt: number
  migrationState: typeof MIGRATION_STATE
}

export type MigrationWriteSummary = {
  writtenChatIds: string[]
  skippedProtectedChatIds: string[]
  verifiedChatIds: string[]
}

export function assertNoProtectedRowsSkipped(
  skippedProtectedChatIds: readonly string[],
): void {
  if (!skippedProtectedChatIds.length) return

  throw new Error(
    `Migration incomplete: protected rows were skipped for chat IDs ${skippedProtectedChatIds.join(', ')}. Review the migration report and resolve them before runtime cutover.`,
  )
}

type MigrationOptions = {
  apply: boolean
  functionName: string
  ownerId: number
  region: string
  reportPath: string
  tableName: string
}

type LegacySources = {
  aiAllowedIds: Set<string>
  agenticEnabledIds: Set<string>
}

function writeLine(message: string): void {
  process.stdout.write(`${message}\n`)
}

function getArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

function getOptions(): MigrationOptions {
  const ownerIdRaw = process.env.BOT_OWNER_ID?.trim()
  const ownerId = Number(ownerIdRaw)
  if (!ownerIdRaw || !Number.isSafeInteger(ownerId) || ownerId <= 0) {
    throw new Error(
      'BOT_OWNER_ID must be set to the bot owner numeric Telegram user id',
    )
  }

  return {
    apply: process.argv.includes('--apply'),
    functionName:
      getArgument('--function') ??
      process.env.LEGACY_CONFIG_FUNCTION_NAME ??
      'telegram-prod-telegram-agent-worker',
    ownerId,
    region:
      getArgument('--region') ??
      process.env.AWS_REGION ??
      process.env.region ??
      'eu-central-1',
    reportPath:
      getArgument('--report') ??
      process.env.CHAT_CONFIGURATION_MIGRATION_REPORT ??
      DEFAULT_REPORT_PATH,
    tableName:
      getArgument('--table') ??
      process.env.CHAT_CONFIGURATION_TABLE_NAME ??
      'chat-configuration',
  }
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

export function parseLegacyChatIds(value: unknown): Set<string> {
  let entries: unknown[]
  if (Array.isArray(value)) {
    entries = value
  } else if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return new Set()
    try {
      const parsed = JSON.parse(trimmed) as unknown
      entries = Array.isArray(parsed) ? parsed : trimmed.split(',')
    } catch {
      entries = trimmed.split(',')
    }
  } else {
    return new Set()
  }

  const ids = new Set<string>()
  for (const entry of entries) {
    const raw = String(entry).trim()
    if (!/^-?\d+$/.test(raw)) continue
    const normalized = BigInt(raw).toString()
    if (normalized !== '0') ids.add(normalized)
  }
  return ids
}

export function buildMigratedChatConfigurations({
  aiAllowedIds,
  agenticEnabledIds,
  existingMigratedIds = new Set<string>(),
  migratedAt,
  ownerId,
}: {
  aiAllowedIds: Set<string>
  agenticEnabledIds: Set<string>
  existingMigratedIds?: Set<string>
  migratedAt: number
  ownerId: number
}): MigratedChatConfiguration[] {
  const allIds = new Set([
    ...aiAllowedIds,
    ...agenticEnabledIds,
    ...existingMigratedIds,
  ])

  return sorted(allIds).map((chatId) => {
    const aiAllowed = aiAllowedIds.has(chatId)
    return {
      chatId,
      aiAllowed,
      // Redis-only entries were ineffective in the legacy implementation and
      // must not become active during cutover.
      agenticEnabled: aiAllowed && agenticEnabledIds.has(chatId),
      version: 1,
      allowUpdatedAt: migratedAt,
      allowUpdatedBy: ownerId,
      migratedAt,
      migrationState: MIGRATION_STATE,
    }
  })
}

async function readLegacySources(
  lambda: LambdaClient,
  functionName: string,
): Promise<LegacySources> {
  const response = await lambda.send(
    new GetFunctionConfigurationCommand({ FunctionName: functionName }),
  )
  const variables = response.Environment?.Variables
  if (variables?.OPENAI_CHAT_IDS === undefined) {
    throw new Error(
      `${functionName} does not expose the legacy OPENAI_CHAT_IDS variable`,
    )
  }
  if (!variables.UPSTASH_REDIS_URL || !variables.UPSTASH_REDIS_TOKEN) {
    throw new Error(
      `${functionName} does not expose the legacy Upstash credentials`,
    )
  }

  const redis = new Redis({
    url: variables.UPSTASH_REDIS_URL,
    token: variables.UPSTASH_REDIS_TOKEN,
  })
  const legacyAgenticIds = await redis.get<unknown>(
    LEGACY_AGENTIC_CHAT_CONFIG_KEY,
  )

  return {
    aiAllowedIds: parseLegacyChatIds(variables.OPENAI_CHAT_IDS),
    agenticEnabledIds: parseLegacyChatIds(legacyAgenticIds),
  }
}

async function assertTableReady(
  dynamo: DynamoDBClient,
  tableName: string,
): Promise<void> {
  let response: DescribeTableCommandOutput
  try {
    response = await dynamo.send(
      new DescribeTableCommand({ TableName: tableName }),
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      throw new Error(
        `${tableName} does not exist; deploy the infrastructure-only commit before migrating`,
      )
    }
    throw error
  }

  const table = response.Table
  const partitionKey = table?.KeySchema?.find(
    ({ KeyType }) => KeyType === 'HASH',
  )
  const partitionType = table?.AttributeDefinitions?.find(
    ({ AttributeName }) => AttributeName === 'chatId',
  )?.AttributeType
  if (
    table?.KeySchema?.length !== 1 ||
    partitionKey?.AttributeName !== 'chatId' ||
    partitionType !== 'S'
  ) {
    throw new Error(`${tableName} has an incompatible key schema`)
  }
  if (table.TableStatus !== 'ACTIVE') {
    throw new Error(`${tableName} is not ACTIVE (${table.TableStatus})`)
  }
  if (table.BillingModeSummary?.BillingMode !== 'PAY_PER_REQUEST') {
    throw new Error(`${tableName} must use PAY_PER_REQUEST billing`)
  }
  if (table.DeletionProtectionEnabled !== true) {
    throw new Error(`${tableName} must have deletion protection enabled`)
  }

  const backups = await dynamo.send(
    new DescribeContinuousBackupsCommand({ TableName: tableName }),
  )
  const pitrStatus =
    backups.ContinuousBackupsDescription?.PointInTimeRecoveryDescription
      ?.PointInTimeRecoveryStatus
  if (pitrStatus !== 'ENABLED') {
    throw new Error(`${tableName} must have point-in-time recovery enabled`)
  }
}

async function getExistingMigratedIds(
  documentClient: DynamoDBDocumentClient,
  tableName: string,
): Promise<Set<string>> {
  const ids = new Set<string>()
  let exclusiveStartKey: Record<string, unknown> | undefined
  do {
    const page = await documentClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'chatId, migrationState',
        FilterExpression: 'migrationState = :migrationState',
        ExpressionAttributeValues: { ':migrationState': MIGRATION_STATE },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )
    for (const item of page.Items ?? []) {
      if (typeof item.chatId === 'string') ids.add(item.chatId)
    }
    exclusiveStartKey = page.LastEvaluatedKey
  } while (exclusiveStartKey)
  return ids
}

function isConditionalCheckFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'ConditionalCheckFailedException'
  )
}

export async function writeAndVerify(
  documentClient: DynamoDBDocumentClient,
  tableName: string,
  configurations: MigratedChatConfiguration[],
): Promise<MigrationWriteSummary> {
  const written: MigratedChatConfiguration[] = []
  const skippedProtectedChatIds: string[] = []

  for (const configuration of configurations) {
    try {
      await documentClient.send(
        new PutCommand({
          TableName: tableName,
          Item: configuration,
          ConditionExpression:
            'attribute_not_exists(chatId) OR migrationState = :migrationState',
          ExpressionAttributeValues: { ':migrationState': MIGRATION_STATE },
        }),
      )
      written.push(configuration)
    } catch (error) {
      if (!isConditionalCheckFailure(error)) throw error
      skippedProtectedChatIds.push(configuration.chatId)
    }
  }

  const verifiedChatIds: string[] = []
  for (const expected of written) {
    const response = await documentClient.send(
      new GetCommand({
        TableName: tableName,
        Key: { chatId: expected.chatId },
        ConsistentRead: true,
      }),
    )
    const actual = response.Item as
      | Partial<MigratedChatConfiguration>
      | undefined
    if (
      actual?.aiAllowed !== expected.aiAllowed ||
      actual.agenticEnabled !== expected.agenticEnabled ||
      actual.migrationState !== MIGRATION_STATE
    ) {
      throw new Error(`Verification failed for chat ${expected.chatId}`)
    }
    verifiedChatIds.push(expected.chatId)
  }

  return {
    writtenChatIds: written.map(({ chatId }) => chatId),
    skippedProtectedChatIds,
    verifiedChatIds,
  }
}

async function writeMigrationReport({
  configurations,
  legacy,
  options,
  summary,
}: {
  configurations: MigratedChatConfiguration[]
  legacy: LegacySources
  options: MigrationOptions
  summary?: MigrationWriteSummary
}): Promise<void> {
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: options.apply ? 'apply' : 'dry-run',
    region: options.region,
    legacyFunctionName: options.functionName,
    targetTableName: options.tableName,
    ownerAllowedChatIds: sorted(legacy.aiAllowedIds),
    redisAgenticChatIds: sorted(legacy.agenticEnabledIds),
    plannedItems: configurations.map(
      ({ chatId, aiAllowed, agenticEnabled }) => ({
        chatId,
        aiAllowed,
        agenticEnabled,
      }),
    ),
    result: summary,
  }
  const directory = dirname(options.reportPath)
  if (directory !== '.') await mkdir(directory, { recursive: true })
  await writeFile(options.reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'w',
  })
}

async function main(): Promise<void> {
  const options = getOptions()
  const dynamo = new DynamoDBClient({ region: options.region })
  const lambda = new LambdaClient({ region: options.region })
  const documentClient = DynamoDBDocumentClient.from(dynamo, {
    marshallOptions: { removeUndefinedValues: true },
  })

  await assertTableReady(dynamo, options.tableName)
  const legacy = await readLegacySources(lambda, options.functionName)
  const existingMigratedIds = await getExistingMigratedIds(
    documentClient,
    options.tableName,
  )
  const configurations = buildMigratedChatConfigurations({
    ...legacy,
    existingMigratedIds,
    migratedAt: Date.now(),
    ownerId: options.ownerId,
  })

  writeLine(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`)
  writeLine(`Region: ${options.region}`)
  writeLine(`Legacy Lambda: ${options.functionName}`)
  writeLine(`Target table: ${options.tableName}`)
  writeLine(`Owner-allowed chats: ${legacy.aiAllowedIds.size}`)
  writeLine(`Owner-allowed chat IDs: ${sorted(legacy.aiAllowedIds).join(', ')}`)
  writeLine(`Redis agentic chats: ${legacy.agenticEnabledIds.size}`)
  writeLine(
    `Redis agentic chat IDs: ${sorted(legacy.agenticEnabledIds).join(', ')}`,
  )
  writeLine(`Items to synchronize: ${configurations.length}`)

  // Preserve the full plan locally before apply starts. The report deliberately
  // contains chat ids and flags, but never Lambda secrets or Redis credentials.
  await writeMigrationReport({ configurations, legacy, options })
  writeLine(`Local report: ${options.reportPath}`)

  if (!options.apply) {
    writeLine(
      'No DynamoDB writes performed. Run again with --apply after review.',
    )
    return
  }

  const summary = await writeAndVerify(
    documentClient,
    options.tableName,
    configurations,
  )
  await writeMigrationReport({ configurations, legacy, options, summary })
  writeLine(`Migration written: ${summary.writtenChatIds.length}`)
  writeLine(`Migration verified: ${summary.verifiedChatIds.length}`)
  writeLine(`Protected rows skipped: ${summary.skippedProtectedChatIds.length}`)
  if (summary.skippedProtectedChatIds.length) {
    writeLine(`Skipped chat IDs: ${summary.skippedProtectedChatIds.join(', ')}`)
  }
  assertNoProtectedRowsSkipped(summary.skippedProtectedChatIds)
  writeLine('No Lambda code or application deployment was changed.')
}

if (import.meta.main) {
  await main()
}
