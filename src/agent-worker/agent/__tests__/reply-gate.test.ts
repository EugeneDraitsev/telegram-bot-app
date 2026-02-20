import type { Message } from 'telegram-typings'

import { logger } from '../../logger'
import { chatModel } from '../models'
import { shouldEngageWithMessage } from '../reply-gate'

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

describe('shouldEngageWithMessage', () => {
  test('returns false for empty message without media', async () => {
    const message = { text: '' } as Message

    await expect(
      shouldEngageWithMessage({
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
      shouldEngageWithMessage({
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
      text: '@testbot and maybe @otherbot too',
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: '@testbot and maybe @otherbot too',
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
      shouldEngageWithMessage({
        message,
        textContent: 'ok',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('runs model for explicit request in reply to our bot', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = {
      text: 'а что если на молоко есть изжога?',
      reply_to_message: { from: { is_bot: true, id: OUR_BOT.id } },
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: 'а что если на молоко есть изжога?',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(true)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false for non-addressed request', async () => {
    const message = { text: 'can you help?' } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: 'can you help?',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  test('runs model for explicit direct request', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = { text: '@testbot can you help?' } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: '@testbot can you help?',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(true)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('runs model for addressed russian question', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = { text: 'ботик ты тут?' } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: 'ботик ты тут?',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(true)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('runs model for addressed draw request', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'engage' }] })
    const message = {
      text: 'ботик нарисуй командную работу альведона и ибупрофена в сене',
    } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent:
          'ботик нарисуй командную работу альведона и ибупрофена в сене',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(true)
    expect(mockInvoke).toHaveBeenCalled()
  })

  test('returns false when model picks ignore', async () => {
    mockInvoke.mockResolvedValue({ tool_calls: [{ name: 'ignore' }] })
    const message = { text: 'bot as a concept is interesting' } as Message

    await expect(
      shouldEngageWithMessage({
        message,
        textContent: 'bot as a concept is interesting',
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

    const message = { text: 'bot as a concept is interesting' } as Message
    await expect(
      shouldEngageWithMessage({
        message,
        textContent: 'bot as a concept is interesting',
        hasImages: false,
        botInfo: OUR_BOT,
      }),
    ).resolves.toEqual(false)

    loggerSpy.mockRestore()
  })
})
