import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { Message } from 'telegram-typings'

import * as memory from '@tg-bot/common'
import { type BotInfo, quickFilter } from '../quick-filter'

const OUR_BOT: BotInfo = { id: 123456, username: 'testbot' }

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
  jest.spyOn(memory, 'getChatMemory').mockResolvedValue('')
  jest.spyOn(memory, 'getGlobalMemory').mockResolvedValue('')
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

  test('returns true for reply to OUR bot', async () => {
    const message = {
      text: 'okay',
      reply_to_message: { from: { is_bot: true, id: OUR_BOT.id } },
    } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns false for reply to ANOTHER bot', async () => {
    const message = {
      text: 'okay',
      reply_to_message: { from: { is_bot: true, id: 999999 } },
    } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      false,
    )
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns false when mentioning another bot', async () => {
    const message = { text: 'hey @otherbot check this' } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      false,
    )
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('does not ignore when mentioning OUR bot', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = { text: 'hey @testbot check this' } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).toHaveBeenCalled()
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

  test('includes chat and global memory in system prompt', async () => {
    jest.spyOn(memory, 'getChatMemory').mockResolvedValue('user likes cats')
    jest.spyOn(memory, 'getGlobalMemory').mockResolvedValue('bot is friendly')
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })

    const message = {
      text: 'hey bot',
      chat: { id: 123 },
    } as unknown as Message

    await quickFilter(message)

    const calls = mockInvoke.mock.calls[0] as { content: string }[][]
    const systemPrompt = calls[0][0].content
    expect(systemPrompt).toContain('user likes cats')
    expect(systemPrompt).toContain('bot is friendly')
  })

  test('fetches memory for the correct chat id', async () => {
    const getChatMemorySpy = jest
      .spyOn(memory, 'getChatMemory')
      .mockResolvedValue('')
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'ignore' }] })

    const message = {
      text: 'hello there',
      chat: { id: 456 },
    } as unknown as Message

    await quickFilter(message)

    expect(getChatMemorySpy).toHaveBeenCalledWith(456)
  })
})
