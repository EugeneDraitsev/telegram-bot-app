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

import { runWithToolContext } from '../context'
import { urlContextTool } from '../url-context.tool'

const TEST_MESSAGE = {
  chat: { id: 1 },
  message_id: 1,
} as Message

const executeTool = (args: Record<string, unknown>) =>
  runWithToolContext(TEST_MESSAGE, undefined, () =>
    urlContextTool.execute(args),
  )

describe('urlContextTool', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  test('returns validation error for empty url', async () => {
    await expect(executeTool({ url: '   ' })).resolves.toBe(
      'Error: URL cannot be empty',
    )
    expect(mockCreate).not.toHaveBeenCalled()
  })

  test('uses summarize prompt when question is not provided', async () => {
    mockCreate.mockResolvedValue({
      outputs: [{ type: 'text', text: 'Page summary' }],
    })

    await expect(
      executeTool({ url: 'https://example.com/article' }),
    ).resolves.toBe('Page summary')
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash-lite',
      input: 'Summarize the content of this page: https://example.com/article',
      tools: [{ type: 'url_context' }],
    })
  })

  test('includes question in the prompt when provided', async () => {
    mockCreate.mockResolvedValue({
      outputs: [{ type: 'text', text: 'Answer' }],
    })

    await expect(
      executeTool({
        url: 'https://example.com/post',
        question: 'What is the main claim?',
      }),
    ).resolves.toBe('Answer')
    expect(mockCreate).toHaveBeenCalledWith({
      model: 'gemini-2.5-flash-lite',
      input: 'What is the main claim?\n\nURL: https://example.com/post',
      tools: [{ type: 'url_context' }],
    })
  })

  test('returns fallback message when model has no text output', async () => {
    mockCreate.mockResolvedValue({ outputs: [] })
    await expect(
      executeTool({ url: 'https://example.com/no-text' }),
    ).resolves.toBe('Could not read URL content')
  })

  test('returns error message when interactions call fails', async () => {
    mockCreate.mockRejectedValue(new Error('network issue'))
    await expect(
      executeTool({ url: 'https://example.com/fail' }),
    ).resolves.toBe('URL read failed: network issue')
  })
})
