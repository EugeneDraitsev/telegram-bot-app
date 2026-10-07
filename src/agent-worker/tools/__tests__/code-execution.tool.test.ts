import * as ai from 'ai'
import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'

const mockGenerateText = jest.fn()
const mockCodeExecution = jest.fn(() => ({ type: 'provider' }))
const mockCodeInterpreter = jest.fn(() => ({ type: 'provider' }))

import { codeExecutionTool } from '../code-execution.tool'
import { runWithToolContext } from '../context'

const TEST_MESSAGE = {
  chat: { id: 1 },
  message_id: 1,
  from: { id: 7 },
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
    // Scoped spies avoid leaking fake provider options into other Bun tests.
    jest.spyOn(ai, 'generateText').mockImplementation(mockGenerateText)
    jest
      .spyOn(common, 'getAiSdkLanguageModel')
      .mockImplementation(
        (config) =>
          common.formatAiModelConfig(config) as unknown as ReturnType<
            typeof common.getAiSdkLanguageModel
          >,
      )
    jest.spyOn(common, 'getAiSdkGoogleTools').mockReturnValue({
      codeExecution: mockCodeExecution,
    } as unknown as ReturnType<typeof common.getAiSdkGoogleTools>)
    jest.spyOn(common, 'getAiSdkOpenAiTools').mockReturnValue({
      codeInterpreter: mockCodeInterpreter,
    } as unknown as ReturnType<typeof common.getAiSdkOpenAiTools>)
    jest.spyOn(common, 'timedCall').mockImplementation((_options, fn) => fn())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('budgets the tool for both model attempts', () => {
    expect(codeExecutionTool.timeoutMs).toBe(51_000)
  })

  test('rejects an empty task', async () => {
    await expect(executeTool({ task: '   ' })).rejects.toThrow(
      'Task cannot be empty',
    )
    expect(mockGenerateText).not.toHaveBeenCalled()
  })

  test('executes code and returns text output', async () => {
    mockGenerateText.mockResolvedValue({ text: '42' })

    await expect(executeTool({ task: '6 * 7' })).resolves.toBe('42')
    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-6-astra',
        prompt: '6 * 7',
        tools: { code_interpreter: { type: 'provider' } },
        toolChoice: 'auto',
        maxRetries: 0,
        timeout: 25_000,
        providerOptions: {
          openai: {
            reasoningEffort: 'low',
            safetyIdentifier: common.getMessageSafetyIdentifier(TEST_MESSAGE),
            store: false,
            passThroughUnsupportedFiles: true,
          },
        },
      }),
    )
  })

  test('falls back to Gemini code execution when Astra fails', async () => {
    mockGenerateText
      .mockRejectedValueOnce(new Error('Astra unavailable'))
      .mockResolvedValueOnce({ text: '42' })

    await expect(executeTool({ task: '6 * 7' })).resolves.toBe('42')
    expect(mockGenerateText).toHaveBeenCalledTimes(2)
    expect(mockGenerateText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: 'google/gemini-3.8-flash',
        tools: { code_execution: { type: 'provider' } },
        providerOptions: { google: { serviceTier: 'priority' } },
      }),
    )
  })

  test('rejects when the model has no text output', async () => {
    mockGenerateText.mockResolvedValue({ text: '' })

    await expect(executeTool({ task: '1 + 1' })).rejects.toThrow(
      'Code execution failed: Code execution produced no output',
    )
  })

  test('rejects when the AI SDK call fails', async () => {
    mockGenerateText.mockRejectedValue(new Error('service unavailable'))

    await expect(executeTool({ task: '1 + 1' })).rejects.toThrow(
      'Code execution failed: service unavailable',
    )
  })
})
