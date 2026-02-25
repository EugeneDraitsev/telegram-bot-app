import type { Bot, Context, NextFunction } from 'grammy/web'

import { setupAllCommands } from '../setup-commands'

const installCommandRegistryMock = jest.fn(
  (..._args: unknown[]) => new Set<string>(['q']),
)
const isRegisteredCommandMessageMock = jest.fn((..._args: unknown[]) => false)
const setupAgenticConfigMock = jest.fn((..._args: unknown[]) => undefined)
const setupCurrencyCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupDat1coCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupExternalApisCommandsMock = jest.fn(
  (..._args: unknown[]) => undefined,
)
const setupGoogleCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupOpenAiCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupTextCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const setupUsersCommandsMock = jest.fn((..._args: unknown[]) => undefined)
const handlePhotoMessageMock = jest.fn((..._args: unknown[]) => undefined)

jest.mock('../command-registry', () => ({
  installCommandRegistry: (...args: unknown[]) =>
    installCommandRegistryMock(...args),
  isRegisteredCommandMessage: (...args: unknown[]) =>
    isRegisteredCommandMessageMock(...args),
}))

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
  default: (...args: unknown[]) => setupGoogleCommandsMock(...args),
}))

jest.mock('../open-ai', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupOpenAiCommandsMock(...args),
}))

jest.mock('../text', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupTextCommandsMock(...args),
}))

jest.mock('../users', () => ({
  __esModule: true,
  default: (...args: unknown[]) => setupUsersCommandsMock(...args),
}))

jest.mock('../photo-router', () => ({
  handlePhotoMessage: (...args: unknown[]) => handlePhotoMessageMock(...args),
}))

type BotHandler = (ctx: Context, next: NextFunction) => Promise<void>

function createBotStub() {
  const handlers = new Map<string, BotHandler>()
  const bot = {
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
    installCommandRegistryMock.mockClear()
    isRegisteredCommandMessageMock.mockReset()
    setupAgenticConfigMock.mockClear()
    setupCurrencyCommandsMock.mockClear()
    setupDat1coCommandsMock.mockClear()
    setupExternalApisCommandsMock.mockClear()
    setupGoogleCommandsMock.mockClear()
    setupOpenAiCommandsMock.mockClear()
    setupTextCommandsMock.mockClear()
    setupUsersCommandsMock.mockClear()
    handlePhotoMessageMock.mockReset()
  })

  test('registers photo middleware and always calls next when photo command is handled', async () => {
    ;(handlePhotoMessageMock as jest.Mock).mockResolvedValue(true)
    const { bot, getHandler } = createBotStub()

    const commandRegistry = setupAllCommands(bot, true)

    const photoHandler = getHandler('message:photo')
    expect(photoHandler).toBeDefined()
    expect(commandRegistry).toBeInstanceOf(Set)

    const ctx = { message: { caption: '/q test' } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await photoHandler?.(ctx, next as NextFunction)

    expect(handlePhotoMessageMock).toHaveBeenCalledWith(ctx, true)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('calls next when photo is not routed to a command', async () => {
    ;(handlePhotoMessageMock as jest.Mock).mockResolvedValue(false)
    const { bot, getHandler } = createBotStub()
    setupAllCommands(bot, true)

    const photoHandler = getHandler('message:photo')
    expect(photoHandler).toBeDefined()

    const ctx = {
      message: { caption: 'just text with photo' },
    } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await photoHandler?.(ctx, next as NextFunction)

    expect(handlePhotoMessageMock).toHaveBeenCalledWith(ctx, true)
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('message middleware calls next for non-command messages', async () => {
    ;(isRegisteredCommandMessageMock as jest.Mock).mockReturnValue(false)
    const { bot, getHandler } = createBotStub()
    setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    expect(messageHandler).toBeDefined()

    const message = { text: 'hello' }
    const ctx = { message } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(next).toHaveBeenCalledTimes(1)
    expect(isRegisteredCommandMessageMock).toHaveBeenCalledWith(
      message,
      expect.any(Set),
    )
  })

  test('message middleware still calls next for command messages', async () => {
    ;(isRegisteredCommandMessageMock as jest.Mock).mockReturnValue(true)
    const { bot, getHandler } = createBotStub()
    setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    expect(messageHandler).toBeDefined()

    const message = { text: '/q test', chat: { id: 123 } }
    const ctx = { message, chat: { id: 123 } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(next).toHaveBeenCalledTimes(1)
    expect(isRegisteredCommandMessageMock).toHaveBeenCalledWith(
      message,
      expect.any(Set),
    )
  })
})
