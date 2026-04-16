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

  test('preserves existing template when updating only stickerFileId', async () => {
    mockedGetDynamicToolsRawByScope.mockResolvedValue([
      {
        name: 'val',
        description: 'Command for Valorant party',
        action: 'send_text',
        template: 'ВАЛОРАНТЫ ОБЩИЙ СБОР @drrrrrr',
        enabled: true,
      },
    ])
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
          description: 'Command for Valorant party',
          action: 'send_text',
          stickerFileId: 'sticker-456',
        }),
    )

    expect(result).toBe('Dynamic tool "/val" saved to chat scope')
    expect(mockedSaveDynamicToolsRaw).toHaveBeenCalledWith(
      [
        {
          name: 'val',
          description: 'Command for Valorant party',
          action: 'send_text',
          template: 'ВАЛОРАНТЫ ОБЩИЙ СБОР @drrrrrr',
          stickerFileId: 'sticker-456',
          enabled: true,
        },
      ],
      777,
    )
  })

  test('rejects new send_text command without template', async () => {
    mockedGetDynamicToolsRawByScope.mockResolvedValue([])

    const result = await runWithToolContext(
      {
        message_id: 1,
        chat: { id: 777, type: 'group' },
      } as Message,
      undefined,
      () =>
        createDynamicToolTool.execute({
          name: 'val',
          description: 'Command for Valorant party',
          action: 'send_text',
        }),
    )

    expect(result).toContain('Error creating dynamic tool:')
    expect(mockedSaveDynamicToolsRaw).not.toHaveBeenCalled()
  })

  test('preserves unrelated legacy raw tools when updating another command', async () => {
    mockedGetDynamicToolsRawByScope.mockResolvedValue([
      {
        name: 'legacy_weather',
        description: 'Legacy weather command',
        action: 'get_weather',
        enabled: true,
      },
      {
        name: 'val',
        description: 'Command for Valorant party',
        action: 'send_text',
        template: 'ВАЛОРАНТЫ ОБЩИЙ СБОР @drrrrrr',
        enabled: true,
      },
    ])
    mockedSaveDynamicToolsRaw.mockResolvedValue(true)

    await runWithToolContext(
      {
        message_id: 1,
        chat: { id: 777, type: 'group' },
      } as Message,
      undefined,
      () =>
        createDynamicToolTool.execute({
          name: 'val',
          description: 'Command for Valorant party',
          action: 'send_text',
          template: 'ВАЛОРАНТЫ ОБЩИЙ СБОР @drrrrrr',
          stickerFileId: 'sticker-456',
        }),
    )

    expect(mockedSaveDynamicToolsRaw).toHaveBeenCalledWith(
      [
        {
          name: 'legacy_weather',
          description: 'Legacy weather command',
          action: 'get_weather',
          enabled: true,
        },
        {
          name: 'val',
          description: 'Command for Valorant party',
          action: 'send_text',
          template: 'ВАЛОРАНТЫ ОБЩИЙ СБОР @drrrrrr',
          stickerFileId: 'sticker-456',
          enabled: true,
        },
      ],
      777,
    )
  })
})
