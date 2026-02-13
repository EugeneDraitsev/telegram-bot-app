import type { Bot } from 'grammy/web'

import { toggleAgenticChat } from '@tg-bot/common'

const setupAgenticConfig = (bot: Bot) => {
  bot.command('toggle', async (ctx) => {
    const chatId = ctx.chat?.id
    if (!chatId) {
      return ctx.reply('❌ Could not determine chat ID')
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
