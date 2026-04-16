import type { Message } from 'telegram-typings'

import * as common from '@tg-bot/common'
import { runWithToolContext } from '../context'
import { createDynamicToolTool } from '../create-dynamic-tool.tool'

const mockedGetDynamicToolsRawByScope = jest.spyOn(
  common,
  'getDynamicToolsRawByScope',
)
const mockedSaveDynamicToolsRaw = jest.spyOn(common, 'saveDynamicToolsRaw')

describe('createDynamicToolTool', () => {
  beforeEach(() => {
    mockedGetDynamicToolsRawByScope.mockReset()
    mockedSaveDynamicToolsRaw.mockReset()
  })

  test('saves stickerFileId in Redis', async () => {
    mockedGetDynamicToolsRawByScope.mockResolvedValue([])
    mockedSaveDynamicToolsRaw.mockResolvedValue(true)

    const result = await runWithToolContext(
      {
        message_id: 1,
        chat: { id: 777, type: 'group' },
      } as Message,
      undefined,
      () =>
        createDynamicToolTool.execute({
          name: 'val',
          description: 'Slash command /val',
          action: 'send_text',
          template: 'VALORANT',
          stickerFileId: 'sticker-123',
          enabled: true,
        }),
    )

    expect(result).toBe('Dynamic tool "/val" saved to chat scope')
    expect(mockedSaveDynamicToolsRaw).toHaveBeenCalledWith(
      [
        {
          name: 'val',
          description: 'Slash command /val',
          action: 'send_text',
          template: 'VALORANT',
          stickerFileId: 'sticker-123',
          enabled: true,
        },
      ],
      777,
    )
  })
})
