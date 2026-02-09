import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { Message } from 'telegram-typings'

import { quickFilter } from '../quick-filter'

type ToolCall = { name: string }
type InvokeResult = { tool_calls?: ToolCall[] }

const mockInvoke = jest.fn<Promise<InvokeResult>, unknown[]>()
const originalEnv = process.env

beforeAll(() => {
  process.env = { ...originalEnv, GEMINI_API_KEY: 'test-key' }

  jest.spyOn(ChatGoogleGenerativeAI.prototype, 'bindTools').mockImplementation(
    () =>
      ({
        invoke: mockInvoke,
      }) as unknown as ReturnType<ChatGoogleGenerativeAI['bindTools']>,
  )
})

afterAll(() => {
  process.env = originalEnv
  jest.restoreAllMocks()
})

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('quickFilter', () => {
  test('returns true for leading slash command', async () => {
    const message = { text: '/start' } as Message

    await expect(quickFilter(message)).resolves.toEqual(true)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns false for short text without images', async () => {
    const message = { text: 'hi' } as Message

    await expect(quickFilter(message)).resolves.toEqual(false)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns true for reply to bot', async () => {
    const message = {
      text: 'okay',
      reply_to_message: { from: { is_bot: true } },
    } as Message

    await expect(quickFilter(message)).resolves.toEqual(true)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns true when model picks engage tool', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })

    const message = { text: 'hey bot' } as Message

    await expect(quickFilter(message)).resolves.toEqual(true)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false when model picks ignore tool', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'ignore' }] })

    const message = { text: 'random chat' } as Message

    await expect(quickFilter(message)).resolves.toEqual(false)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false when model throws error', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mockInvoke.mockRejectedValue(new Error('boom'))

    const message = { text: 'should fail' } as Message

    await expect(quickFilter(message)).resolves.toEqual(false)
    consoleSpy.mockRestore()
  })
})
