import {
  CreateBackupCommand,
  DescribeBackupCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'

import {
  indexUsers,
  type MigratedUser,
  parseDestinationUsers,
  parseLegacyUsers,
  summarizeMigration,
} from './statistics-migration.js'

const sourceTable = process.env.CHAT_STATISTICS_TABLE_NAME ?? 'chat-statistics'
const destinationTable =
  process.env.CHAT_USER_STATISTICS_TABLE_NAME ?? 'chat-user-statistics'
const region =
  process.env.AWS_REGION ??
  process.env.AWS_DEFAULT_REGION ??
  process.env.region ??
  'eu-central-1'
const writeConcurrency = 20

const dynamoClient = new DynamoDBClient({ region })
const documentClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: { removeUndefinedValues: true },
})

const scanAll = async (tableName: string): Promise<Record<string, unknown>[]> => {
  const items: Record<string, unknown>[] = []
  let exclusiveStartKey: Record<string, unknown> | undefined

  do {
    const result = await documentClient.send(
      new ScanCommand({
        TableName: tableName,
        ConsistentRead: true,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )
    items.push(...((result.Items as Record<string, unknown>[]) ?? []))
    exclusiveStartKey = result.LastEvaluatedKey
  } while (exclusiveStartKey)

  return items
}

const readState = async () => {
  const [legacyItems, destinationItems] = await Promise.all([
    scanAll(sourceTable),
    scanAll(destinationTable),
  ])
  const legacyUsers = parseLegacyUsers(legacyItems)
  const destinationUsers = parseDestinationUsers(destinationItems)

  return {
    legacyItems,
    legacyUsers,
    destinationUsers,
    summary: summarizeMigration(
      legacyItems,
      legacyUsers,
      destinationUsers,
    ),
  }
}

const printSummary = (label: string, summary: object) => {
  console.log(`${label}:`)
  console.log(JSON.stringify(summary, null, 2))
}

const assertMigrated = (summary: Awaited<ReturnType<typeof readState>>['summary']) => {
  if (
    summary.missingUsers > 0 ||
    summary.usersBelowLegacyCount > 0 ||
    summary.usersMissingChatInfo > 0
  ) {
    throw new Error('Migration verification failed')
  }
}

const createBackup = async () => {
  const backupName = `chat-statistics-before-cutover-${new Date()
    .toISOString()
    .replace(/\D/g, '')}`
  const created = await dynamoClient.send(
    new CreateBackupCommand({ BackupName: backupName, TableName: sourceTable }),
  )
  const backupArn = created.BackupDetails?.BackupArn
  if (!backupArn) {
    throw new Error('DynamoDB did not return a backup ARN')
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const described = await dynamoClient.send(
      new DescribeBackupCommand({ BackupArn: backupArn }),
    )
    const status = described.BackupDescription?.BackupDetails?.BackupStatus
    if (status === 'AVAILABLE') {
      printSummary('Backup', { backupArn, backupName, region, status })
      return
    }
    if (status === 'DELETED') {
      throw new Error('Backup was deleted before becoming available')
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }

  throw new Error(`Backup did not become available in time: ${backupArn}`)
}

const isConditionalConflict = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'ConditionalCheckFailedException'

const insertMissingUser = async (
  user: MigratedUser,
  migratedAt: number,
): Promise<'inserted' | 'concurrent'> => {
  try {
    await documentClient.send(
      new PutCommand({
        TableName: destinationTable,
        Item: { ...user, updatedAt: migratedAt },
        ConditionExpression:
          'attribute_not_exists(#chatId) AND attribute_not_exists(#userId)',
        ExpressionAttributeNames: {
          '#chatId': 'chatId',
          '#userId': 'userId',
        },
      }),
    )
    return 'inserted'
  } catch (error) {
    if (isConditionalConflict(error)) {
      return 'concurrent'
    }
    throw error
  }
}

const enrichExistingUser = async (
  source: MigratedUser,
  destination: MigratedUser,
  migratedAt: number,
): Promise<boolean> => {
  const expressions: string[] = []
  const names: Record<string, string> = {
    '#chatId': 'chatId',
    '#userId': 'userId',
  }
  const values: Record<string, unknown> = {}

  if (source.chatInfo !== undefined && destination.chatInfo === undefined) {
    expressions.push('#chatInfo = if_not_exists(#chatInfo, :chatInfo)')
    names['#chatInfo'] = 'chatInfo'
    values[':chatInfo'] = source.chatInfo
  }
  if (source.chatInfo !== undefined && destination.updatedAt === undefined) {
    expressions.push('#updatedAt = if_not_exists(#updatedAt, :updatedAt)')
    names['#updatedAt'] = 'updatedAt'
    values[':updatedAt'] = migratedAt
  }
  if (source.optedOut !== undefined && destination.optedOut === undefined) {
    expressions.push('#optedOut = if_not_exists(#optedOut, :optedOut)')
    names['#optedOut'] = 'optedOut'
    values[':optedOut'] = source.optedOut
  }

  if (expressions.length === 0) {
    return false
  }

  await documentClient.send(
    new UpdateCommand({
      TableName: destinationTable,
      Key: { chatId: source.chatId, userId: source.userId },
      UpdateExpression: `SET ${expressions.join(', ')}`,
      ConditionExpression:
        'attribute_exists(#chatId) AND attribute_exists(#userId)',
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }),
  )
  return true
}

const migrate = async () => {
  const before = await readState()
  printSummary('Before migration', before.summary)
  if (before.summary.usersBelowLegacyCount > 0) {
    throw new Error('Destination contains counters below their legacy values')
  }

  const destinationByKey = indexUsers(before.destinationUsers)
  const migratedAt = Date.now()
  let inserted = 0
  let concurrent = 0
  let enriched = 0

  for (let index = 0; index < before.legacyUsers.length; index += writeConcurrency) {
    const batch = before.legacyUsers.slice(index, index + writeConcurrency)
    const results = await Promise.all(
      batch.map(async (user) => {
        const destination = destinationByKey.get(
          JSON.stringify([user.chatId, user.userId]),
        )
        if (!destination) {
          return insertMissingUser(user, migratedAt)
        }
        return (await enrichExistingUser(user, destination, migratedAt))
          ? 'enriched'
          : 'unchanged'
      }),
    )

    inserted += results.filter((result) => result === 'inserted').length
    concurrent += results.filter((result) => result === 'concurrent').length
    enriched += results.filter((result) => result === 'enriched').length
  }

  const after = await readState()
  assertMigrated(after.summary)
  printSummary('Migration writes', { inserted, concurrent, enriched })
  printSummary('After migration', after.summary)
}

const command = process.argv[2] ?? 'inspect'

switch (command) {
  case 'inspect': {
    const state = await readState()
    printSummary('Migration state', state.summary)
    break
  }
  case 'backup':
    await createBackup()
    break
  case 'apply':
    await migrate()
    break
  case 'verify': {
    const state = await readState()
    assertMigrated(state.summary)
    printSummary('Verified migration', state.summary)
    break
  }
  default:
    throw new Error(
      'Usage: bun run migrate:chat-statistics -- inspect|backup|apply|verify',
    )
}
