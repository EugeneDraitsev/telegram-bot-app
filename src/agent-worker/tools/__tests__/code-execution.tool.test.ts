import type { Message } from 'telegram-typings'

const mockCreate = jest.fn()

jest.mock('../../agent/models', () => ({
  FAST_MODEL: 'gemini-2.5-flash-lite',
  ai: {
    interactions: {
      create: mockCreate,
    },
  },
}))

import { codeExecutionTool } from '../code-execution.tool'
import { runWithToolContext } from '../context'

const TEST_MESSAGE = {
  chat: { id: 1 },
  message_id: 1,
} as Message

const executeTool = (args: Record<string, unknown>) =>
  runWithToolContext(TEST_MESSAGE, undefined, () =>
    codeExecutionTool.execute(args),
  )

describe('codeExecutionTool', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  test('returns validation error for empty task', async () => {
    await expect(executeTool({ task: '   ' })).resolves.toBe(
      'Error: task cannot be empty',
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('executes code and returns text output', async () => {
    mockCreate.mockResolvedValue({
      outputs: [{ type: 'text', text: '42' }],
    })

    await expect(executeTool({ task: '6 * 7' })).resolves.toBe('42')
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash-lite',
      input: '6 * 7',
      tools: [{ type: 'code_execution' }],
    })
  })

  test('returns fallback message when model has no text output', async () => {
    mockCreate.mockResolvedValue({
      outputs: [{ type: 'code_execution_result' }],
    })
    await expect(executeTool({ task: '1 + 1' })).resolves.toBe(
      'Code execution produced no output',
    )
  })

  test('returns error message when interactions call fails', async () => {
    mockCreate.mockRejectedValue(new Error('service unavailable'))
    await expect(executeTool({ task: '1 + 1' })).resolves.toBe(
      'Code execution failed: service unavailable',
    )
  })
})
