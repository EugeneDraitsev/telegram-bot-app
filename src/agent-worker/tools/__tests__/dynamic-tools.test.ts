import type { Message } from 'telegram-typings'

import * as common from '@tg-bot/common'
import { getCollectedResponses, runWithToolContext } from '../context'
import { executeDynamicCommandFromMessage } from '../dynamic-tools'

const mockedGetDynamicToolsRaw = jest.spyOn(common, 'getDynamicToolsRaw')

describe('executeDynamicCommandFromMessage', () => {
  beforeEach(() => {
    mockedGetDynamicToolsRaw.mockReset()
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
})
