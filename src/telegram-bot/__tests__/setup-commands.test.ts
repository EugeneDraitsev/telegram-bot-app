import type { Bot, Context, NextFunction } from 'grammy/web'

import * as common from '@tg-bot/common'
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
  )
    .command(['q', 'qq'], jest.fn())
    .command('g', jest.fn())
    .command('ge', jest.fn())
    .command('gp', jest.fn())
})
const setupOpenAiCommandsMock = jest.fn((..._args: unknown[]) => undefined)
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
}))

jest.mock('../open-ai', () => ({
  __esModule: true,
  default: (bot: unknown, ...args: unknown[]) =>
    setupOpenAiCommandsMock(bot, ...args),
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
  const handlers = new Map<string, BotHandler[]>()
  const bot = {
    command: jest.fn((_command: string | string[], _handler: unknown) => bot),
    on: jest.fn((event: string, handler: unknown) => {
      handlers.set(event, [
        ...(handlers.get(event) ?? []),
        handler as BotHandler,
      ])
      return bot
    }),
  } as unknown as Bot

  return {
    bot,
    getHandler: (event: string): BotHandler | undefined => {
      const eventHandlers = handlers.get(event)
      if (!eventHandlers?.length) {
        return undefined
      }

      return async (ctx, next) => {
        let lastIndex = -1
        const run = async (index: number): Promise<void> => {
          if (index <= lastIndex) {
            throw new Error('next() called multiple times')
          }
          lastIndex = index

          const handler = eventHandlers[index]
          if (!handler) {
            await next()
            return
          }

          await handler(ctx, (() => run(index + 1)) as NextFunction)
        }

        await run(0)
      }
    },
  }
}

describe('setupAllCommands', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
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

  test('message middleware defers agent commands to agent worker', async () => {
    const invokeSpy = jest
      .spyOn(common, 'invokeAgentLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeAgentLambda>>,
      )
    const { bot, getHandler } = createBotStub()

    const commandRegistry = setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    expect(messageHandler).toBeDefined()
    expect(commandRegistry.has('q')).toBe(true)

    const message = {
      text: '/q test',
      chat: { id: 123 },
      entities: [{ type: 'bot_command', offset: 0, length: 2 }],
    }
    const ctx = { message, chat: { id: 123 } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(invokeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bypassReplyGate: true,
        message: expect.objectContaining({ text: 'test' }),
      }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  test('message middleware defers newline agent commands to agent worker', async () => {
    const invokeSpy = jest
      .spyOn(common, 'invokeAgentLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeAgentLambda>>,
      )
    const { bot, getHandler } = createBotStub()

    setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    const message = {
      text: '/q\nsummarize this',
      chat: { id: 123 },
      entities: [{ type: 'bot_command', offset: 0, length: 2 }],
    }
    const ctx = { message, chat: { id: 123 } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(invokeSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        bypassReplyGate: true,
        message: expect.objectContaining({ text: 'summarize this' }),
      }),
    )
    expect(next).not.toHaveBeenCalled()
  })

  test('message middleware defers non-agent commands to reply worker', async () => {
    const invokeSpy = jest
      .spyOn(common, 'invokeReplyLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeReplyLambda>>,
      )
    const { bot, getHandler } = createBotStub()

    const commandRegistry = setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    expect(messageHandler).toBeDefined()
    expect(commandRegistry.has('ge')).toBe(true)
    expect(commandRegistry.has('gp')).toBe(true)

    const message = {
      text: '/ge draw',
      chat: { id: 123 },
      entities: [{ type: 'bot_command', offset: 0, length: 3 }],
    }
    const update = { update_id: 777, message }
    const ctx = { update, message, chat: { id: 123 } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(invokeSpy).toHaveBeenCalledWith(update)
    expect(next).not.toHaveBeenCalled()
  })

  test('message middleware normalizes uppercase commands for reply worker', async () => {
    const invokeSpy = jest
      .spyOn(common, 'invokeReplyLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeReplyLambda>>,
      )
    const { bot, getHandler } = createBotStub()

    setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    const message = {
      text: '/GE draw',
      chat: { id: 123 },
      entities: [{ type: 'bot_command', offset: 0, length: 3 }],
    }
    const update = { update_id: 778, message }
    const ctx = { update, message, chat: { id: 123 } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(invokeSpy).toHaveBeenCalledWith({
      ...update,
      message: { ...message, text: '/ge draw' },
    })
    expect(message.text).toBe('/GE draw')
    expect(next).not.toHaveBeenCalled()
  })

  test('message middleware forwards caption commands as text commands', async () => {
    const invokeSpy = jest
      .spyOn(common, 'invokeReplyLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeReplyLambda>>,
      )
    const { bot, getHandler } = createBotStub()

    setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    const message = {
      caption: '/g cats',
      caption_entities: [{ type: 'bot_command', offset: 0, length: 2 }],
      chat: { id: 123 },
      photo: [{ file_id: 'photo-1', width: 100 }],
    }
    const update = { update_id: 779, message }
    const ctx = { update, message, chat: { id: 123 } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(invokeSpy).toHaveBeenCalledWith({
      ...update,
      message: {
        ...message,
        text: '/g cats',
        entities: message.caption_entities,
      },
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('message middleware ignores commands addressed to another bot', async () => {
    const agentSpy = jest
      .spyOn(common, 'invokeAgentLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeAgentLambda>>,
      )
    const replySpy = jest
      .spyOn(common, 'invokeReplyLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeReplyLambda>>,
      )
    const { bot, getHandler } = createBotStub()

    setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    const message = {
      text: '/q@OtherBot test',
      chat: { id: 123 },
      entities: [{ type: 'bot_command', offset: 0, length: 11 }],
    }
    const ctx = {
      me: { username: 'OurBot' },
      message,
      chat: { id: 123 },
    } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(agentSpy).not.toHaveBeenCalled()
    expect(replySpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('message middleware lets unregistered slash commands reach agent worker', async () => {
    const invokeSpy = jest
      .spyOn(common, 'invokeAgentLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeAgentLambda>>,
      )
    const { bot, getHandler } = createBotStub()

    setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    const message = {
      text: '/val extra',
      chat: { id: 123 },
      entities: [{ type: 'bot_command', offset: 0, length: 4 }],
    }
    const ctx = {
      me: { username: 'OurBot' },
      message,
      chat: { id: 123 },
    } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(invokeSpy).toHaveBeenCalledWith(expect.objectContaining({ message }))
    expect(next).toHaveBeenCalledTimes(1)
  })

  test('message middleware skips captionless album siblings', async () => {
    const invokeSpy = jest
      .spyOn(common, 'invokeAgentLambda')
      .mockResolvedValue(
        {} as Awaited<ReturnType<typeof common.invokeAgentLambda>>,
      )
    const { bot, getHandler } = createBotStub()

    setupAllCommands(bot, true)

    const messageHandler = getHandler('message')
    const message = {
      media_group_id: 'album-1',
      chat: { id: 123 },
      photo: [{ file_id: 'photo-2', width: 100 }],
    }
    const ctx = { message, chat: { id: 123 } } as unknown as Context
    const next = jest.fn().mockResolvedValue(undefined)

    await messageHandler?.(ctx, next as NextFunction)

    expect(invokeSpy).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
  })
})
