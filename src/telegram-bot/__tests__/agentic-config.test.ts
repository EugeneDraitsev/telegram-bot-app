import type { Bot, Context } from 'grammy/web'

import * as common from '@tg-bot/common'
import setupAgenticConfig from '../configuration-commands/agentic-config'

type CommandHandler = (ctx: Context) => Promise<unknown>

function setupHandler(): CommandHandler {
  let handler: CommandHandler | undefined
  const bot = {
    command(_command: string, value: CommandHandler) {
      handler = value
      return bot
    },
  } as unknown as Bot

  setupAgenticConfig(bot)
  if (!handler) throw new Error('toggle handler was not registered')
  return handler
}

function createContext(status: string) {
  const message = {
    message_id: 1,
    chat: { id: -100, type: 'group' },
    from: { id: 7 },
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

describe('/toggle authorization', () => {
  const toggleSpy = jest.spyOn(common, 'toggleAgenticChat')

  beforeEach(() => {
    toggleSpy.mockReset()
  })

  test('rejects regular chat members', async () => {
    const handler = setupHandler()
    const ctx = createContext('member')

    await handler(ctx)

    expect(toggleSpy).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Only chat administrators can change this setting',
    )
  })

  test('allows chat administrators', async () => {
    toggleSpy.mockResolvedValue({ enabled: true })
    const handler = setupHandler()
    const ctx = createContext('administrator')

    await handler(ctx)

    expect(toggleSpy).toHaveBeenCalledWith(-100)
    expect(ctx.reply).toHaveBeenCalledWith('Agentic bot: ✅ Enabled')
  })
})
