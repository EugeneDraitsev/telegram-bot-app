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

  test('runs model for reply to OUR bot even without explicit request marker', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = {
      text: 'как дела',
      reply_to_message: { from: { is_bot: true, id: OUR_BOT.id } },
    } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('runs model for explicit request in reply to OUR bot', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = {
      text: 'answer please',
      reply_to_message: { from: { is_bot: true, id: OUR_BOT.id } },
    } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false for reply to ANOTHER bot', async () => {
    const message = {
      text: 'answer please',
      reply_to_message: { from: { is_bot: true, id: 999999 } },
    } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      false,
    )
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns false when mentioning another account', async () => {
    const message = { text: 'hey @otherbot please answer' } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      false,
    )
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('allows when OUR bot and another account are both mentioned', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = {
      text: 'hey @testbot and @otherbot are in this thread',
    } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('runs model for bot word address without explicit request marker', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = { text: 'ботик как дела' } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('does not ignore explicit request addressed to OUR bot', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = { text: 'hey @testbot, can you check this?' } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('runs model for addressed russian question', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = { text: 'ботик ты тут?' } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('runs model for addressed draw request', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = {
      text: 'ботик нарисуй командную работу альведона и ибупрофена в сене',
    } as Message

    await expect(quickFilter(message, undefined, OUR_BOT)).resolves.toEqual(
      true,
    )
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns true when model picks engage tool', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = { text: 'bot as a concept is interesting' } as Message

    await expect(quickFilter(message)).resolves.toEqual(true)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false when model picks ignore tool', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'ignore' }] })
    const message = { text: 'bot as a concept is interesting' } as Message

    await expect(quickFilter(message)).resolves.toEqual(false)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false when model throws error', async () => {
    const consoleSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)
    mockInvoke.mockRejectedValue(new Error('boom'))

    const message = { text: 'bot in this context maybe' } as Message

    await expect(quickFilter(message)).resolves.toEqual(false)
    consoleSpy.mockRestore()
  })

  test('includes chat and global memory in system prompt', async () => {
    jest.spyOn(memory, 'getChatMemory').mockResolvedValue('user likes cats')
    jest.spyOn(memory, 'getGlobalMemory').mockResolvedValue('bot is friendly')
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })

    const message = {
      text: 'bot with status update',
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
      text: 'bot with status update',
      chat: { id: 456 },
    } as unknown as Message

    await quickFilter(message)

    expect(getChatMemorySpy).toHaveBeenCalledWith(456)
  })
})
