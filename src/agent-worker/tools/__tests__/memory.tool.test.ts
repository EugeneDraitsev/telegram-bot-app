import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { runWithToolContext, setToolChatMemory } from '../context'
import { updateMemoryTool } from '../memory.tool'

const setChatMemorySpy = jest.spyOn(common, 'setChatMemory')

describe('updateMemoryTool', () => {
  beforeEach(() => {
    setChatMemorySpy.mockReset()
  })

  test('updates only the current chat memory', async () => {
    setChatMemorySpy.mockResolvedValue(true)

    const result = await runWithToolContext(
      {
        message_id: 1,
        chat: { id: 777, type: 'group' },
        from: { id: 7 },
      } as Message,
      undefined,
      () => updateMemoryTool.execute({ content: 'Important chat note' }),
    )

    expect(result).toBe('Chat memory updated successfully.')
    expect(setChatMemorySpy).toHaveBeenCalledWith(777, 'Important chat note')
  })

  test('rejects an update built on memory that changed since the model read it', async () => {
    setChatMemorySpy.mockResolvedValue(true)
    const getChatMemorySpy = jest
      .spyOn(common, 'getChatMemory')
      .mockResolvedValue('- Alice likes tea')
    const message = {
      message_id: 1,
      chat: { id: 777, type: 'group' },
      from: { id: 7 },
    } as Message

    await runWithToolContext(message, undefined, async () => {
      // A failed or stale preload showed the model empty memory.
      setToolChatMemory('')
      await expect(
        updateMemoryTool.execute({ content: '- Bob likes coffee' }),
      ).rejects.toThrow('Current memory:\n- Alice likes tea')
      expect(setChatMemorySpy).not.toHaveBeenCalled()

      await expect(
        updateMemoryTool.execute({
          content: '- Alice likes tea\n- Bob likes coffee',
        }),
      ).resolves.toBe('Chat memory updated successfully.')
    })

    expect(getChatMemorySpy).toHaveBeenCalledWith(777, { fresh: true })
    expect(setChatMemorySpy).toHaveBeenCalledWith(
      777,
      '- Alice likes tea\n- Bob likes coffee',
    )
    getChatMemorySpy.mockRestore()
  })

  test('does not expose global scope in the tool schema', () => {
    expect(updateMemoryTool.declaration.parameters).toEqual({
      type: 'object',
      properties: {
        content: expect.any(Object),
      },
      required: ['content'],
    })
  })
})
