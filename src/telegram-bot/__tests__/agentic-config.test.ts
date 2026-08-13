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
  text = '/toggle',
}: {
  status?: string
  userId?: number
  chatId?: number
  text?: string
} = {}) {
  const message = {
    message_id: 1,
    chat: { id: chatId, type: 'group' },
    from: { id: userId },
    text,
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

describe('agentic configuration command authorization', () => {
  const toggleSpy = jest.spyOn(common, 'toggleAgenticChat')
  const allowSpy = jest.spyOn(common, 'setChatAiAllowed')
  const originalOwnerId = process.env.BOT_OWNER_ID

  beforeEach(() => {
    toggleSpy.mockReset()
    allowSpy.mockReset()
    process.env.BOT_OWNER_ID = '42'
  })

  afterAll(() => {
    toggleSpy.mockRestore()
    allowSpy.mockRestore()
    if (originalOwnerId === undefined) {
      delete process.env.BOT_OWNER_ID
    } else {
      process.env.BOT_OWNER_ID = originalOwnerId
    }
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

  test('/allowai rejects everybody except the configured bot owner', async () => {
    const handler = setupHandlers().get('allowai')
    const ctx = createContext({ userId: 7, text: '/allowai' })

    await handler?.(ctx)

    expect(allowSpy).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Only the bot owner can change the AI allowlist',
    )
  })

  test('/allowai lets the owner allow the current chat without enabling it', async () => {
    allowSpy.mockResolvedValue({
      configuration: {
        chatId: '-100',
        aiAllowed: true,
        agenticEnabled: false,
        version: 1,
      },
    })
    const handler = setupHandlers().get('allowai')
    const ctx = createContext({ userId: 42, text: '/allowai' })

    await handler?.(ctx)

    expect(allowSpy).toHaveBeenCalledWith(-100, true, 42)
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('✅ Allowed'),
      { parse_mode: 'HTML' },
    )
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('a chat administrator can run /toggle'),
      { parse_mode: 'HTML' },
    )
  })

  test('/disallowai accepts an explicit target chat id in the owner DM', async () => {
    allowSpy.mockResolvedValue({
      configuration: {
        chatId: '-100777',
        aiAllowed: false,
        agenticEnabled: false,
        version: 2,
      },
    })
    const handler = setupHandlers().get('disallowai')
    const ctx = createContext({
      userId: 42,
      chatId: 42,
      text: '/disallowai -100777',
    })

    await handler?.(ctx)

    expect(allowSpy).toHaveBeenCalledWith(-100777, false, 42)
  })

  test('owner commands reject an invalid explicit chat id', async () => {
    const handler = setupHandlers().get('allowai')
    const ctx = createContext({ userId: 42, text: '/allowai not-a-chat' })

    await handler?.(ctx)

    expect(allowSpy).not.toHaveBeenCalled()
    expect(ctx.reply).toHaveBeenCalledWith(
      '❌ Provide a valid numeric chat ID: /allowai -100123456',
    )
  })
})
