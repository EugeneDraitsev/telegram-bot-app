import { readFileSync } from 'node:fs'
import {
  type DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb'

import {
  buildMigratedChatConfigurations,
  parseLegacyChatIds,
  writeAndVerify,
} from './migrate-chat-configuration.mjs'

describe('chat configuration migration planning', () => {
  test('parses comma separated, JSON and auto-deserialized chat ids', () => {
    expect([...parseLegacyChatIds('1, -2, nope, 0')]).toEqual(['1', '-2'])
    expect([...parseLegacyChatIds('["-10", 20]')]).toEqual(['-10', '20'])
    expect([...parseLegacyChatIds(['003', -4])]).toEqual(['3', '-4'])
  })

  test('preserves both legacy gates without activating Redis-only chats', () => {
    const configurations = buildMigratedChatConfigurations({
      aiAllowedIds: new Set(['1', '2']),
      agenticEnabledIds: new Set(['2', '3']),
      existingMigratedIds: new Set(['4']),
      migratedAt: 123456,
      ownerId: 42,
    })

    expect(configurations).toEqual([
      expect.objectContaining({
        chatId: '1',
        aiAllowed: true,
        agenticEnabled: false,
      }),
      expect.objectContaining({
        chatId: '2',
        aiAllowed: true,
        agenticEnabled: true,
      }),
      expect.objectContaining({
        chatId: '3',
        aiAllowed: false,
        agenticEnabled: false,
      }),
      expect.objectContaining({
        chatId: '4',
        aiAllowed: false,
        agenticEnabled: false,
      }),
    ])
  })

  test('skips protected live rows and verifies every migration-owned write', async () => {
    const configurations = buildMigratedChatConfigurations({
      aiAllowedIds: new Set(['1', '2']),
      agenticEnabledIds: new Set(['1', '2']),
      migratedAt: 123456,
      ownerId: 42,
    })
    const send = jest.fn(async (command: PutCommand | GetCommand) => {
      if (command instanceof PutCommand && command.input.Item?.chatId === '2') {
        const error = new Error('protected row')
        error.name = 'ConditionalCheckFailedException'
        throw error
      }
      if (command instanceof GetCommand) {
        return { Item: configurations[0] }
      }
      return {}
    })

    const summary = await writeAndVerify(
      { send } as unknown as DynamoDBDocumentClient,
      'chat-configuration',
      configurations,
    )

    expect(summary).toEqual({
      writtenChatIds: ['1'],
      skippedProtectedChatIds: ['2'],
      verifiedChatIds: ['1'],
    })
    expect(send).toHaveBeenCalledTimes(3)
  })

  test('requires the CloudFormation table instead of creating one', () => {
    const source = readFileSync('tools/migrate-chat-configuration.mts', 'utf8')

    expect(source).not.toContain('CreateTableCommand')
    expect(source).toContain('DescribeTableCommand')
    expect(source).toContain('DescribeContinuousBackupsCommand')
  })

  test('declares the permanent table protections in CloudFormation', () => {
    const resources = readFileSync('resources.yml', 'utf8')
    const tableBlock = resources
      .split('  ChatConfigurationTable:')[1]
      ?.split(/^ {2}\S/m)[0]

    expect(tableBlock).toContain('DeletionPolicy: Retain')
    expect(tableBlock).toContain('UpdateReplacePolicy: Retain')
    expect(tableBlock).toContain('BillingMode: PAY_PER_REQUEST')
    expect(tableBlock).toContain('DeletionProtectionEnabled: true')
    expect(tableBlock).toContain('PointInTimeRecoveryEnabled: true')
    expect(tableBlock).not.toContain('TimeToLiveSpecification')
  })
})
