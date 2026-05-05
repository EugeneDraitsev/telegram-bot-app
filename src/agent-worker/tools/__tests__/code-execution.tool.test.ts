import type { Message } from 'telegram-typings'

const mockGenerateText = jest.fn()
const mockCodeExecution = jest.fn(() => ({ type: 'provider' }))

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

jest.mock('@tg-bot/common', () => ({
  getAiSdkGoogleTools: () => ({ codeExecution: mockCodeExecution }),
  getAiSdkLanguageModel: (config: { provider: string; model: string }) =>
    `${config.provider}/${config.model}`,
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}))

jest.mock('../../agent/models', () => ({
  HELPER_TEXT_MODEL_CONFIG: {
    provider: 'google',
    model: 'gemini-2.5-flash-lite',
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
    mockGenerateText.mockReset()
    mockCodeExecution.mockClear()
  })

  test('returns validation error for empty task', async () => {
    await expect(executeTool({ task: '   ' })).resolves.toBe(
      'Error: task cannot be empty',
    )
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  test('executes code and returns text output', async () => {
    mockGenerateText.mockResolvedValue({ text: '42' })

    await expect(executeTool({ task: '6 * 7' })).resolves.toBe('42')
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-2.5-flash-lite',
        prompt: '6 * 7',
        tools: { code_execution: { type: 'provider' } },
        toolChoice: 'auto',
        maxRetries: 0,
        providerOptions: { google: { serviceTier: 'priority' } },
      }),
    )
  })

  test('returns fallback message when model has no text output', async () => {
    mockGenerateText.mockResolvedValue({ text: '' })

    await expect(executeTool({ task: '1 + 1' })).resolves.toBe(
      'Code execution produced no output',
    )
  })

  test('returns error message when AI SDK call fails', async () => {
    mockGenerateText.mockRejectedValue(new Error('service unavailable'))

    await expect(executeTool({ task: '1 + 1' })).resolves.toBe(
      'Code execution failed: service unavailable',
    )
  })
})
