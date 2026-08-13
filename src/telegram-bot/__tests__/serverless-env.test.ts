import { readFileSync } from 'node:fs'

const serverlessConfig = readFileSync('serverless.yml', 'utf8')
const iamRoles = readFileSync('iamRoles.yml', 'utf8')
describe('agentic chat configuration infrastructure', () => {
  test('wires the CloudFormation-owned table and owner controls', () => {
    expect(serverlessConfig).toContain('CHAT_CONFIGURATION_TABLE_NAME:')
    expect(serverlessConfig).toContain('AGENTIC_BOT_ENABLED:')
    expect(serverlessConfig).toContain(`BOT_OWNER_ID: \${env:BOT_OWNER_ID}`)
    expect(serverlessConfig).not.toContain(
      `BOT_OWNER_ID: \${env:BOT_OWNER_ID, ''}`,
    )
  })

  test('retains the legacy environment allowlist through the rollback window', () => {
    expect(serverlessConfig).toContain('OPENAI_CHAT_IDS')
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
})
