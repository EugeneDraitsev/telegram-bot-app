import type { Bot, Context } from 'grammy/web'

import * as common from '@tg-bot/common'
import setupAgenticConfig from '../configuration-commands/agentic-config'

type CommandHandler = (ctx: Context) => Promise<unknown>

function setupHandlers(): Map<string, CommandHandler> {
  const handlers = new Map<string, CommandHandler>()
  const bot = {
    command(command: string, value: CommandHandler) {
      handlers.set(command, value)
      return bot
    },
  } as unknown as Bot

  setupAgenticConfig(bot)
  return handlers
}

function createContext({
  status = 'administrator',
  userId = 7,
  chatId = -100,
}: {
  status?: string
  userId?: number
  chatId?: number
} = {}) {
  const message = {
    message_id: 1,
    chat: { id: chatId, type: 'group' },
    from: { id: userId },
    text: '/toggle',
  }
  return {
    chat: message.chat,
    from: message.from,
    message,
    api: {
      getChatMember: jest.fn().mockResolvedValue({ status }),
    },
    reply: jest.fn().mockResolvedValue(undefined),
  } as unknown as Context
}

describe('/toggle command authorization', () => {
  const toggleSpy = jest.spyOn(common, 'toggleAgenticChat')

  beforeEach(() => {
    toggleSpy.mockReset()
  })

  afterAll(() => {
    toggleSpy.mockRestore()
  })

  test('is the only command registered by agentic configuration', () => {
    expect([...setupHandlers().keys()]).toEqual(['toggle'])
  })

  test('/toggle rejects regular chat members', async () => {
    const handler = setupHandlers().get('toggle')
    const ctx = createContext({ status: 'member' })

    await handler?.(ctx)

    expect(toggleSpy).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Only chat administrators can change this setting',
    )
  })

  test('/toggle remains available to chat administrators', async () => {
    toggleSpy.mockResolvedValue({ enabled: true })
    const handler = setupHandlers().get('toggle')
    const ctx = createContext()

    await handler?.(ctx)

    expect(toggleSpy).toHaveBeenCalledWith(-100, 7)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Agentic bot: ✅ Enabled'),
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('within ~5 seconds'),
    )
  })
})
