import type { Bot } from 'grammy/web'

import { isMessageAuthorChatAdmin, toggleAgenticChat } from '@tg-bot/common'

const setupAgenticConfig = (bot: Bot) => {
  bot.command('toggle', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) {
      return ctx.reply('❌ Could not determine chat ID')
    }

    if (!(await isMessageAuthorChatAdmin(ctx.message, ctx.api))) {
      return ctx.reply('❌ Only chat administrators can change this setting')
    }

    const result = await toggleAgenticChat(chatId)

    if (result.error) {
      return ctx.reply(`❌ ${result.error}`)
    }

    const status = result.enabled ? '✅ Enabled' : '❌ Disabled'
    return ctx.reply(`Agentic bot: ${status}`)
  })
}

export default setupAgenticConfig
