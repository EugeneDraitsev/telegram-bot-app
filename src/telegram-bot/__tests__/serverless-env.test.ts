import { readFileSync } from 'node:fs'

const serverlessConfig = readFileSync('serverless.yml', 'utf8')
const deployWorkflow = readFileSync('.github/workflows/deploy.yml', 'utf8')
const pullRequestWorkflow = readFileSync(
  '.github/workflows/pull-request.yml',
  'utf8',
)
const iamRoles = readFileSync('iamRoles.yml', 'utf8')
const resources = readFileSync('resources.yml', 'utf8')

function getRoleStatement(resource: string, role: string): string {
  return (
    role.split(resource)[0]?.split('              - Effect: Allow').at(-1) ?? ''
  )
}

describe('agentic chat configuration infrastructure', () => {
  test('wires the CloudFormation-owned table and owner controls', () => {
    expect(serverlessConfig).toContain('CHAT_CONFIGURATION_TABLE_NAME:')
    expect(serverlessConfig).toContain('AGENTIC_BOT_ENABLED:')
    expect(serverlessConfig).toContain(`BOT_OWNER_ID: \${env:BOT_OWNER_ID}`)
    expect(serverlessConfig).not.toContain(
      `BOT_OWNER_ID: \${env:BOT_OWNER_ID, ''}`,
    )
  })

  test('does not restore the legacy environment allowlist', () => {
    expect(serverlessConfig).not.toContain('OPENAI_CHAT_IDS')
  })

  test('never injects the offline idempotency bypass into deployed Lambdas', () => {
    expect(serverlessConfig).not.toContain('IS_OFFLINE:')
  })

  test('does not retain an immutable Lambda version after every deployment', () => {
    expect(serverlessConfig).toContain('versionFunctions: false')
  })

  test('passes the configurable worker alert email into production packaging', () => {
    expect(deployWorkflow).toContain('WORKER_FAILURE_ALERT_EMAIL:')
    expect(deployWorkflow).toContain('vars.WORKER_FAILURE_ALERT_EMAIL')
  })

  test('passes admin API configuration into pull request packaging', () => {
    expect(pullRequestWorkflow).toContain(
      `TELEGRAM_OIDC_CLIENT_ID: \${{vars.TELEGRAM_OIDC_CLIENT_ID}}`,
    )
    expect(pullRequestWorkflow).toContain(
      'ADMIN_SESSION_SECRET: ci-placeholder',
    )
  })

  test('still wires the Telegram token into ingress', () => {
    expect(serverlessConfig).toContain(`TOKEN: \${env:TOKEN}`)
  })

  test('lets ingress read only the configuration table before enqueue', () => {
    const ingressRole = iamRoles
      .split('  TelegramIngressRole:')[1]
      ?.split('  TelegramAdminApiRole:')[0]

    expect(ingressRole).toContain('dynamodb:GetItem')
    expect(ingressRole).toContain(`\${self:custom.chatConfigurationTableName}`)
    expect(ingressRole).not.toContain('dynamodb:UpdateItem')
  })

  test('gives the Telegram session API only its two DynamoDB tables', () => {
    expect(serverlessConfig).toContain('telegram-admin-api:')
    expect(serverlessConfig).toContain(
      `TELEGRAM_OIDC_CLIENT_ID: \${env:TELEGRAM_OIDC_CLIENT_ID}`,
    )
    expect(serverlessConfig).toContain(
      `ADMIN_SESSION_SECRET: \${env:ADMIN_SESSION_SECRET}`,
    )
    expect(serverlessConfig).toContain('path: /chats/{chatId}/access')
    expect(serverlessConfig).toContain(
      'CHAT_USER_STATISTICS_USER_ID_INDEX_NAME:',
    )

    const adminRole = iamRoles
      .split('  TelegramAdminApiRole:')[1]
      ?.split('  TelegramReplyWorkerRole:')[0]

    expect(adminRole).toContain('dynamodb:GetItem')
    expect(adminRole).toContain('dynamodb:BatchGetItem')
    expect(adminRole).toContain('dynamodb:Scan')
    expect(adminRole).toContain('dynamodb:UpdateItem')
    expect(adminRole).toContain('dynamodb:Query')
    expect(adminRole).toContain(`\${self:custom.chatConfigurationTableName}`)
    expect(adminRole).toContain(`\${self:custom.chatUserStatisticsTableName}`)
    expect(adminRole).toContain(
      `/index/\${self:custom.chatUserStatisticsUserIdIndexName}`,
    )
    expect(adminRole).not.toContain('sqs:')
    expect(adminRole).not.toContain('lambda:')
  })

  test('grants reconciliation reads to DynamoDB writer roles', () => {
    const activityRole = iamRoles
      .split('  TelegramActivityWorkerRole:')[1]
      ?.split('  CurrencySchedulerRole:')[0]
    const connectRole = iamRoles
      .split('  WebsocketConnectRole:')[1]
      ?.split('  WebsocketDisconnectRole:')[0]
    const statsRole = iamRoles
      .split('  WebsocketStatsRole:')[1]
      ?.split('  WebsocketBroadcastStatsRole:')[0]

    expect(
      getRoleStatement(
        `\${self:custom.chatEventsTableName}`,
        activityRole ?? '',
      ),
    ).toContain('dynamodb:GetItem')
    for (const role of [connectRole, statsRole]) {
      expect(
        getRoleStatement(
          `\${self:custom.websocketConnectionsTableName}`,
          role ?? '',
        ),
      ).toContain('dynamodb:GetItem')
    }
  })

  test('keeps the user chat index keys-only', () => {
    const statisticsTable = resources
      .split('  ChatUserStatisticsTable:')[1]
      ?.split('  ChatConfigurationTable:')[0]

    expect(statisticsTable).toContain('ProjectionType: KEYS_ONLY')
    expect(statisticsTable).not.toContain('NonKeyAttributes:')
  })

  // A TimeToLiveSpecification once drifted from ChatEventsTable onto
  // ChatUserStatisticsTable because a new table block was inserted between
  // BillingMode and the TTL lines. Pin which tables may expire their items.
  test('expires only ephemeral websocket connections', () => {
    const tableBlock = (name: string, next: string) =>
      resources.split(`  ${name}:`)[1]?.split(`  ${next}:`)[0] ?? ''

    expect(
      tableBlock('ChatWebsocketConnectionsTable', 'ChatEventsTable'),
    ).toContain('TimeToLiveSpecification:')
    expect(
      tableBlock('ChatEventsTable', 'ChatUserStatisticsTable'),
    ).not.toContain('TimeToLiveSpecification:')
    expect(
      tableBlock('ChatUserStatisticsTable', 'ChatConfigurationTable'),
    ).not.toContain('TimeToLiveSpecification:')
    expect(resources.match(/TimeToLiveSpecification:/g)).toHaveLength(1)
  })

  test('alarms on fail-closed configuration reads without runtime metric calls', () => {
    expect(
      resources.match(/FilterPattern: '"chat_configuration\.read_failed"'/g),
    ).toHaveLength(4)
    expect(resources).toContain('Ref: TelegramDashbotLogGroup')
    expect(resources).toContain('Ref: TelegramDashreplyDashworkerLogGroup')
    expect(resources).toContain('Ref: TelegramDashagentDashworkerLogGroup')
    expect(resources).toContain('Ref: TelegramDashactivityDashworkerLogGroup')

    const alarm = resources.split('  ChatConfigurationReadFailureAlarm:')[1]
    expect(alarm).toContain('MetricName: ReadFailures')
    expect(alarm).toContain('Threshold: 0')
    expect(alarm).toContain('Ref: WorkerFailureAlertsTopic')
  })
})
