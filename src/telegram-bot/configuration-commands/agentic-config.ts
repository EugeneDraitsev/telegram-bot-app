import type { Bot, Context } from 'grammy/web'

import {
  getParsedText,
  isBotOwner,
  isMessageAuthorChatAdmin,
  setChatAiAllowed,
  toggleAgenticChat,
} from '@tg-bot/common'

function getOwnerCommandTargetChatId(ctx: Context): number | undefined {
  const input = getParsedText(ctx.message?.text).trim()
  if (!input) {
    return ctx.chat?.id
  }

  if (!/^-?\d+$/.test(input)) {
    return undefined
  }

  const chatId = Number(input)
  return Number.isSafeInteger(chatId) && chatId !== 0 ? chatId : undefined
}

function ownerAllowlistHandler(aiAllowed: boolean) {
  return async (ctx: Context) => {
    const ownerId = ctx.from?.id
    if (!isBotOwner(ownerId) || ownerId === undefined) {
      return ctx.reply('❌ Only the bot owner can change the AI allowlist')
    }

    const chatId = getOwnerCommandTargetChatId(ctx)
    if (!chatId) {
      return ctx.reply(
        `❌ Provide a valid numeric chat ID: /${aiAllowed ? 'allowai' : 'disallowai'} -100123456`,
      )
    }

    const result = await setChatAiAllowed(chatId, aiAllowed, ownerId)
    if (result.error || !result.configuration) {
      return ctx.reply(`❌ ${result.error ?? 'Could not update chat access'}`)
    }

    if (!aiAllowed) {
      return ctx.reply(
        `AI access for <code>${chatId}</code>: ❌ Disallowed\nAgentic bot: ❌ Disabled\nApplies everywhere within ~5 seconds.`,
        { parse_mode: 'HTML' },
      )
    }

    const agenticStatus = result.configuration.agenticEnabled
      ? '✅ Enabled'
      : '❌ Disabled — a chat administrator can run /toggle'
    return ctx.reply(
      `AI access for <code>${chatId}</code>: ✅ Allowed\nAgentic bot: ${agenticStatus}\nApplies everywhere within ~5 seconds.`,
      { parse_mode: 'HTML' },
    )
  }
}

const setupAgenticConfig = (bot: Bot) => {
  bot.command('allowai', ownerAllowlistHandler(true))
  bot.command('disallowai', ownerAllowlistHandler(false))

  bot.command('toggle', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) {
      return ctx.reply('❌ Could not determine chat ID')
    }

    if (!(await isMessageAuthorChatAdmin(ctx.message, ctx.api))) {
      return ctx.reply('❌ Only chat administrators can change this setting')
    }

    const result = await toggleAgenticChat(chatId, ctx.from?.id)

    if (result.error) {
      return ctx.reply(`❌ ${result.error}`)
    }

    const status = result.enabled ? '✅ Enabled' : '❌ Disabled'
    return ctx.reply(
      `Agentic bot: ${status}\nApplies everywhere within ~5 seconds.`,
    )
  })
}

export default setupAgenticConfig
