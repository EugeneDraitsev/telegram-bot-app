import { readFileSync } from 'node:fs'

const serverlessConfig = readFileSync('serverless.yml', 'utf8')
const deployWorkflow = readFileSync('.github/workflows/deploy.yml', 'utf8')
const iamRoles = readFileSync('iamRoles.yml', 'utf8')
const resources = readFileSync('resources.yml', 'utf8')
describe('agentic chat configuration infrastructure', () => {
  test('wires the CloudFormation-owned table and owner controls', () => {
    expect(serverlessConfig).toContain('CHAT_CONFIGURATION_TABLE_NAME:')
    expect(serverlessConfig).toContain('AGENTIC_BOT_ENABLED:')
    expect(serverlessConfig).toContain(`BOT_OWNER_ID: \${env:BOT_OWNER_ID}`)
    expect(serverlessConfig).not.toContain(
      `BOT_OWNER_ID: \${env:BOT_OWNER_ID, ''}`,
    )
  })

  test('uses DynamoDB as the only runtime chat authorization source', () => {
    expect(serverlessConfig).not.toContain('OPENAI_CHAT_IDS')
  })

  test('uses the deployed configuration table during local offline runs', () => {
    expect(serverlessConfig).toContain(
      'self:custom.runtimeChatConfigurationTableNameByStage.',
    )
    expect(serverlessConfig).toContain(
      'runtimeChatConfigurationTableNameByStage:\n    local: chat-configuration',
    )
  })

  test('does not retain an immutable Lambda version after every deployment', () => {
    expect(serverlessConfig).toContain('versionFunctions: false')
  })

  test('passes the configurable worker alert email into production packaging', () => {
    expect(deployWorkflow).toContain('WORKER_FAILURE_ALERT_EMAIL:')
    expect(deployWorkflow).toContain('vars.WORKER_FAILURE_ALERT_EMAIL')
  })

  test('still wires the Telegram token into ingress', () => {
    expect(serverlessConfig).toContain(`TOKEN: \${env:TOKEN}`)
  })

  test('lets ingress read only the configuration table before enqueue', () => {
    const ingressRole = iamRoles
      .split('  TelegramIngressRole:')[1]
      ?.split('  TelegramReplyWorkerRole:')[0]

    expect(ingressRole).toContain('dynamodb:GetItem')
    expect(ingressRole).toContain(`\${self:custom.chatConfigurationTableName}`)
    expect(ingressRole).not.toContain('dynamodb:UpdateItem')
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
