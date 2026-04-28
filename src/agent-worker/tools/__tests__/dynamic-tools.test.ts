import type { Message } from 'telegram-typings'

import * as common from '@tg-bot/common'
import { getCollectedResponses, runWithToolContext } from '../context'
import { executeDynamicCommandFromMessage } from '../dynamic-tools'

const mockSearchWeb = jest.fn()

const mockedGetDynamicToolsRaw = jest.spyOn(common, 'getDynamicToolsRaw')

describe('executeDynamicCommandFromMessage', () => {
  beforeEach(() => {
    mockedGetDynamicToolsRaw.mockReset()
    mockSearchWeb.mockReset()
  })

  test('executes stored slash command directly from Redis', async () => {
    mockedGetDynamicToolsRaw.mockResolvedValue([
      {
        name: 'val',
        description: 'Slash command /val',
        action: 'send_text',
        template: 'ВАЛОРАНТЫ ОБЩИЙ СБОР @drrrrrr',
        stickerFileId: 'sticker-123',
        enabled: true,
      },
    ])

    const message = {
      message_id: 1,
      text: '/val',
      chat: { id: 777, type: 'group' },
    } as Message

    const result = await runWithToolContext(message, undefined, async () => {
      const execution = await executeDynamicCommandFromMessage(message)
      return {
        execution,
        responses: getCollectedResponses(),
      }
    })

    expect(result.execution).toEqual({
      matched: true,
      name: 'val',
      result: 'Dynamic tool "val" added response',
    })
    expect(result.responses).toEqual([
      { type: 'text', text: 'ВАЛОРАНТЫ ОБЩИЙ СБОР @drrrrrr' },
      { type: 'sticker', fileId: 'sticker-123' },
    ])
  })

  test('returns web_search result as tool output without collecting duplicate text', async () => {
    mockedGetDynamicToolsRaw.mockResolvedValue([
      {
        name: 'ada',
        description: 'Check Cardano ADA price',
        action: 'web_search',
        template: 'Курс Cardano {{output}}',
        searchFormat: 'brief',
        enabled: true,
      },
    ])
    mockSearchWeb.mockResolvedValue('ADA is $0.44 right now')

    const message = {
      message_id: 1,
      text: '/ada Cardano ADA price',
      chat: { id: 777, type: 'group' },
    } as Message

    const result = await runWithToolContext(message, undefined, async () => {
      const execution = await executeDynamicCommandFromMessage(
        message,
        new Set(),
        {
          searchWeb: mockSearchWeb,
        },
      )
      return {
        execution,
        responses: getCollectedResponses(),
      }
    })

    expect(mockSearchWeb).toHaveBeenCalledWith(
      'Курс Cardano\nCardano ADA price',
      'brief',
    )
    expect(result.execution).toEqual({
      matched: true,
      name: 'ada',
      result: 'ADA is $0.44 right now',
    })
    expect(result.responses).toEqual([])
  })
})
