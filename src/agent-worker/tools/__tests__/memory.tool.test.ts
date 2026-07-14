import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { runWithToolContext } from '../context'
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
