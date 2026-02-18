import type { Message } from 'telegram-typings'

import { logger } from '../../logger'
import { chatModel } from '../models'
import { shouldRespondAfterRecheck } from '../reply-gate'

type ToolCall = { name: string }
type InvokeResult = { tool_calls?: ToolCall[] }

const OUR_BOT = { id: 123456, username: 'testbot' }
const mockInvoke = jest.fn<Promise<InvokeResult>, unknown[]>()

beforeAll(() => {
  jest.spyOn(chatModel, 'bindTools').mockImplementation(
    () =>
      ({
        invoke: mockInvoke,
      }) as unknown as ReturnType<typeof chatModel.bindTools>,
  )
})

afterAll(() => {
  jest.restoreAllMocks()
})

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('shouldRespondAfterRecheck', () => {
  test('returns false for empty message without media', async () => {
    const message = { text: '' } as Message

    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: '',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns false for mention of another account', async () => {
    const message = { text: '@otherbot can you help?' } as Message

    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: '@otherbot can you help?',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('allows when OUR bot and another account are both mentioned', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = {
      text: '@testbot can you answer? and maybe @otherbot too',
    } as Message

    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: '@testbot can you answer? and maybe @otherbot too',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(true)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('runs model for reply to our bot without explicit request marker', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'ignore' }] })
    const message = {
      text: 'ok',
      reply_to_message: { from: { is_bot: true, id: OUR_BOT.id } },
    } as Message

    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: 'ok',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns true for explicit request in reply to our bot without model call', async () => {
    const message = {
      text: 'а что если на молоко есть изжога?',
      reply_to_message: { from: { is_bot: true, id: OUR_BOT.id } },
    } as Message

    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: 'а что если на молоко есть изжога?',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(true)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns false for non-addressed request', async () => {
    const message = { text: 'can you help?' } as Message

    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: 'can you help?',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('returns true when model picks engage for explicit direct request', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = { text: '@testbot can you help?' } as Message

    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: '@testbot can you help?',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(true)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false when model picks ignore', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'ignore' }] })
    const message = { text: 'bot, answer please' } as Message

    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: 'bot, answer please',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false when model throws', async () => {
    const loggerSpy = jest
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined)
    mockInvoke.mockRejectedValue(new Error('boom'))

    const message = { text: 'bot, answer please' } as Message
    await expect(
      shouldRespondAfterRecheck({
        message,
        textContent: 'bot, answer please',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)

    loggerSpy.mockRestore()
  })
})
