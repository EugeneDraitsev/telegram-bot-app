import type { Message } from 'grammy/types'

const mockGenerateText = jest.fn()
const mockCodeExecution = jest.fn(() => ({ type: 'provider' }))
const mockCodeInterpreter = jest.fn(() => ({ type: 'provider' }))

jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
}))

jest.mock('@tg-bot/common', () => ({
  formatAiModelConfig: (config: { provider: string; model: string }) =>
    `${config.provider}/${config.model}`,
  getAiSdkGoogleTools: () => ({ codeExecution: mockCodeExecution }),
  getAiSdkLanguageModel: (config: { provider: string; model: string }) =>
    `${config.provider}/${config.model}`,
  getAiSdkOpenAiTools: () => ({ codeInterpreter: mockCodeInterpreter }),
  getAiSdkProviderOptions: (
    config: { provider: string },
    options: {
      reasoningEffort?: string
      chatId?: string | number
      serviceTier?: string
      store?: boolean
    },
  ) =>
    config.provider === 'google'
      ? { google: { serviceTier: options.serviceTier } }
      : {
          openai: {
            reasoningEffort: options.reasoningEffort,
            safetyIdentifier: String(options.chatId),
            store: options.store,
          },
        },
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  timedCall: (_options: unknown, fn: () => Promise<unknown>) => fn(),
}))

jest.mock('../../agent/models', () => ({
  HELPER_TEXT_FALLBACK_MODEL_CONFIG: {
    provider: 'google',
    model: 'gemini-3.5-flash-lite',
  },
  HELPER_TEXT_FALLBACK_REASONING_EFFORT: 'none',
  HELPER_TEXT_MODEL_CONFIG: {
    provider: 'openai',
    model: 'gpt-5.6-luna',
  },
  HELPER_TEXT_MODEL_REASONING_EFFORT: 'none',
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
    mockCodeInterpreter.mockClear()
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
        model: 'openai/gpt-5.6-luna',
        prompt: '6 * 7',
        tools: { code_interpreter: { type: 'provider' } },
        toolChoice: 'auto',
        maxRetries: 0,
        timeout: 25_000,
        providerOptions: {
          openai: {
            reasoningEffort: 'none',
            safetyIdentifier: '1',
            store: false,
          },
        },
      }),
    )
  })

  test('falls back to Gemini code execution when Luna fails', async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error('Luna unavailable'))
      .mockResolvedValueOnce({ text: '42' })

    await expect(executeTool({ task: '6 * 7' })).resolves.toBe('42')
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: 'google/gemini-3.5-flash-lite',
        tools: { code_execution: { type: 'provider' } },
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
