import type { Api } from 'grammy'
import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { runWithToolContext } from '../context'
import { createDynamicToolTool } from '../create-dynamic-tool.tool'
import { getBaseAgentTools } from '../index'

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
        chat: { id: 777, type: 'private' },
        from: { id: 777 },
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

  test.each(getBaseAgentTools().map((tool) => String(tool.declaration.name)))(
    'reserves the built-in tool name %s',
    async (name) => {
      mockedGetDynamicToolsRawByScope.mockResolvedValue([])

      await expect(
        runWithToolContext(
          {
            message_id: 1,
            chat: { id: 777, type: 'private' },
            from: { id: 777 },
          } as Message,
          undefined,
          () =>
            createDynamicToolTool.execute({
              name,
              description: 'Shadows a built-in tool',
              action: 'send_text',
              template: 'text',
            }),
        ),
      ).rejects.toThrow('conflicts with built-in tool name')
      expect(mockedSaveDynamicToolsRaw).not.toHaveBeenCalled()
    },
  )

  test('does not overwrite saved commands it could not read', async () => {
    mockedGetDynamicToolsRawByScope.mockRejectedValue(new Error('redis down'))

    await expect(
      runWithToolContext(
        {
          message_id: 1,
          chat: { id: 777, type: 'private' },
          from: { id: 777 },
        } as Message,
        undefined,
        () =>
          createDynamicToolTool.execute({
            name: 'val',
            description: 'Slash command /val',
            action: 'send_text',
            template: 'VALORANT',
          }),
      ),
    ).rejects.toThrow('redis down')
    expect(mockedGetDynamicToolsRawByScope).toHaveBeenCalledWith(777, {
      fresh: true,
    })
    expect(mockedSaveDynamicToolsRaw).not.toHaveBeenCalled()
  })

  test('saves animationFileId for a two-letter command', async () => {
    mockedGetDynamicToolsRawByScope.mockResolvedValue([])
    mockedSaveDynamicToolsRaw.mockResolvedValue(true)

    const result = await runWithToolContext(
      {
        message_id: 1,
        chat: { id: 777, type: 'private' },
        from: { id: 777 },
      } as Message,
      undefined,
      () =>
        createDynamicToolTool.execute({
          name: '/ov',
          description: 'Slash command /ov',
          action: 'send_text',
          template: 'Go to overwatch',
          animationFileId: ' gif-123 ',
        }),
    )

    expect(result).toBe('Dynamic tool "/ov" saved to chat scope')
    expect(mockedSaveDynamicToolsRaw).toHaveBeenCalledWith(
      [
        {
          name: 'ov',
          description: 'Slash command /ov',
          action: 'send_text',
          template: 'Go to overwatch',
          animationFileId: 'gif-123',
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
        chat: { id: 777, type: 'private' },
        from: { id: 777 },
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

  test('replaces a stored sticker when a GIF is attached', async () => {
    mockedGetDynamicToolsRawByScope.mockResolvedValue([
      {
        name: 'val',
        description: 'Command for Valorant party',
        action: 'send_text',
        template: 'VALORANT',
        stickerFileId: 'sticker-123',
        enabled: true,
      },
    ])
    mockedSaveDynamicToolsRaw.mockResolvedValue(true)

    await runWithToolContext(
      {
        message_id: 1,
        chat: { id: 777, type: 'private' },
        from: { id: 777 },
      } as Message,
      undefined,
      () =>
        createDynamicToolTool.execute({
          name: 'val',
          description: 'Command for Valorant party',
          action: 'send_text',
          animationFileId: 'gif-123',
        }),
    )

    const [savedTools] = mockedSaveDynamicToolsRaw.mock.calls[0] ?? []
    expect(JSON.parse(JSON.stringify(savedTools))).toEqual([
      {
        name: 'val',
        description: 'Command for Valorant party',
        action: 'send_text',
        template: 'VALORANT',
        animationFileId: 'gif-123',
        enabled: true,
      },
    ])
  })

  test('rejects a command with both a sticker and a GIF', async () => {
    mockedGetDynamicToolsRawByScope.mockResolvedValue([])

    await expect(
      runWithToolContext(
        {
          message_id: 1,
          chat: { id: 777, type: 'private' },
          from: { id: 777 },
        } as Message,
        undefined,
        () =>
          createDynamicToolTool.execute({
            name: 'val',
            description: 'Command for Valorant party',
            action: 'send_text',
            template: 'VALORANT',
            stickerFileId: 'sticker-123',
            animationFileId: 'gif-123',
          }),
      ),
    ).rejects.toThrow('Use either stickerFileId or animationFileId, not both')
    expect(mockedSaveDynamicToolsRaw).not.toHaveBeenCalled()
  })

  test('rejects new send_text command without template', async () => {
    mockedGetDynamicToolsRawByScope.mockResolvedValue([])

    await expect(
      runWithToolContext(
        {
          message_id: 1,
          chat: { id: 777, type: 'private' },
          from: { id: 777 },
        } as Message,
        undefined,
        () =>
          createDynamicToolTool.execute({
            name: 'val',
            description: 'Command for Valorant party',
            action: 'send_text',
          }),
      ),
    ).rejects.toThrow('Error creating dynamic tool:')
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
        chat: { id: 777, type: 'private' },
        from: { id: 777 },
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

  test('rejects persistent command changes from regular group members', async () => {
    const memberApi = {
      getChatMember: jest.fn().mockResolvedValue({ status: 'member' }),
    } as unknown as Pick<Api, 'getChatMember'>

    await expect(
      runWithToolContext(
        {
          message_id: 1,
          chat: { id: -100, type: 'group' },
          from: { id: 7 },
        } as Message,
        undefined,
        () =>
          createDynamicToolTool.execute({
            name: 'val',
            description: 'Command for Valorant party',
            action: 'send_text',
            template: 'VALORANT',
          }),
        memberApi,
      ),
    ).rejects.toThrow('only chat administrators')
    expect(mockedGetDynamicToolsRawByScope).not.toHaveBeenCalled()
    expect(mockedSaveDynamicToolsRaw).not.toHaveBeenCalled()
  })
})
