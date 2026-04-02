import type { Bot, Context, NextFunction } from 'grammy/web'

import { setupAllCommands } from '../setup-commands'

const setupAgenticConfigMock = jest.fn((..._args: unknown[]) => undefined)
const setupCurrencyCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupDat1coCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupExternalApisCommandsMock = jest.fn(
  (..._args: unknown[]) => undefined,
)
const setupGoogleCommandsMock = jest.fn((bot: unknown, ..._args: unknown[]) => {
  ;(
    bot as {
      command: (command: string | string[], ...middleware: unknown[]) => Bot
    }
  ).command(['q', 'qq', 'ge'], jest.fn())
})
const setupMultimodalGeminiCommandsMock = jest.fn((..._args: unknown[]) =>
  Promise.resolve(undefined),
)
const setupImageGenerationGeminiCommandsMock = jest.fn((..._args: unknown[]) =>
  Promise.resolve(undefined),
)
const setupOpenAiCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupImageGenerationOpenAiCommandsMock = jest.fn((..._args: unknown[]) =>
  Promise.resolve(undefined),
)
const setupTextCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupUsersCommandsMock = jest.fn((..._args: unknown[]) => undefined)

jest.mock('../configuration-commands', () => ({
  setupAgenticConfig: (...args: unknown[]) => setupAgenticConfigMock(...args),
}))

jest.mock('../currency', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupCurrencyCommandsMock(...args),
}))

jest.mock('../dat1co', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupDat1coCommandsMock(...args),
}))

jest.mock('../external-apis', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupExternalApisCommandsMock(...args),
}))

jest.mock('../google', () => ({
  __esModule: true,
  default: (bot: unknown, ...args: unknown[]) =>
    setupGoogleCommandsMock(bot, ...args),
  GEMMA_MODEL: 'gemma-3-12b-it',
  setupMultimodalGeminiCommands: (...args: unknown[]) =>
    setupMultimodalGeminiCommandsMock(...args),
  setupImageGenerationGeminiCommands: (...args: unknown[]) =>
    setupImageGenerationGeminiCommandsMock(...args),
}))

jest.mock('../open-ai', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupOpenAiCommandsMock(...args),
  setupImageGenerationOpenAiCommands: (...args: unknown[]) =>
    setupImageGenerationOpenAiCommandsMock(...args),
}))

jest.mock('../text', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupTextCommandsMock(...args),
}))

jest.mock('../users', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupUsersCommandsMock(...args),
}))

type BotHandler = (ctx: Context, next: NextFunction) => Promise<void>

function createBotStub() {
  const handlers = new Map<string, BotHandler>()
  const bot = {
    command: jest.fn((_command: string | string[], _handler: unknown) => bot),
    on: jest.fn((event: string, handler: unknown) => {
      handlers.set(event, handler as BotHandler)
      return bot
    }),
  } as unknown as Bot

  return {
    bot,
    getHandler: (event: string) => handlers.get(event),
  }
}

describe('setupAllCommands', () => {
  beforeEach(() => {
    setupAgenticConfigMock.mockClear()
    setupCurrencyCommandsMock.mockClear()
    setupDat1coCommandsMock.mockClear()
    setupExternalApisCommandsMock.mockClear()
    setupGoogleCommandsMock.mockClear()
    setupMultimodalGeminiCommandsMock.mockClear()
    setupImageGenerationGeminiCommandsMock.mockClear()
    setupOpenAiCommandsMock.mockClear()
    setupImageGenerationOpenAiCommandsMock.mockClear()
    setupTextCommandsMock.mockClear()
    setupUsersCommandsMock.mockClear()
  })

  test('registers photo middleware and always calls next when photo command is handled', async () => {
    const { bot, getHandler } = createBotStub()

    const commandRegistry = setupAllCommands(bot, true)

    const photoHandler = getHandler('message:photo')
    expect(photoHandler).toBeDefined()
    expect(commandRegistry).toBeInstanceOf(Set)

    const ctx = { message: { caption: '/q test' } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await photoHandler?.(ctx, next as NextFunction)

    expect(setupMultimodalGeminiCommandsMock).toHaveBeenCalledWith(
      ctx,
      true,
      'gemini-3.1-flash-lite-preview',
    )
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('calls next when photo is not routed to a command', async () => {
    const { bot, getHandler } = createBotStub()

    setupAllCommands(bot, true)

    const photoHandler = getHandler('message:photo')
    expect(photoHandler).toBeDefined()

    const ctx = {
      message: { caption: 'just text with photo' },
    } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await photoHandler?.(ctx, next as NextFunction)

    expect(setupMultimodalGeminiCommandsMock).not.toHaveBeenCalled()
    expect(setupImageGenerationGeminiCommandsMock).not.toHaveBeenCalled()
    expect(setupImageGenerationOpenAiCommandsMock).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('message middleware calls next for non-command messages', async () => {
    const { bot, getHandler } = createBotStub()

    const commandRegistry = setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    expect(messageHandler).toBeDefined()
    expect(commandRegistry.has('q')).toBe(true)

    const message = { text: 'hello' }
    const ctx = { message } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(next).toHaveBeenCalledTimes(1)
  })

  test('message middleware still calls next for command messages', async () => {
    const { bot, getHandler } = createBotStub()

    const commandRegistry = setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    expect(messageHandler).toBeDefined()
    expect(commandRegistry.has('q')).toBe(true)

    const message = { text: '/q test', chat: { id: 123 } }
    const ctx = { message, chat: { id: 123 } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(next).toHaveBeenCalledTimes(1)
    expect(setupMultimodalGeminiCommandsMock).not.toHaveBeenCalled()
  })
})
