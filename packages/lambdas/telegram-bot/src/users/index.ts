import type { Context, Telegraf } from 'telegraf'

import {
  checkCommand,
  getChatName,
  getCommandData,
  getFormattedChatStatistics,
  getUsersList,
} from '@tg-bot/common'
import { getDailyStatistics } from './daily-statistics'

const setupUsersCommands = (bot: Telegraf<Context>) => {
  bot.hears(checkCommand('/z'), async (ctx) =>
    ctx.reply(await getFormattedChatStatistics(ctx?.chat?.id ?? '')),
  )

  bot.hears(checkCommand('/s'), async (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    const chatName = getChatName(ctx?.chat)
    const chatId = ctx?.chat?.id ?? ''

    const { message, image } = await getDailyStatistics(
      replyId,
      chatId,
      chatName,
    )

    if (image) {
      return ctx.replyWithPhoto(
        { source: image, filename: 'stats.png' },
        { reply_parameters: { message_id: replyId }, caption: message },
      )
    }

    return ctx.replyWithHTML(
      `${chatName} chat statistics: https://telegram-bot-ui.vercel.app/chat/${chatId}`,
      {
        reply_parameters: { message_id: replyId },
      },
    )
  })

  bot.hears(checkCommand('/all'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await getUsersList(ctx.chat?.id ?? '', text), {
      reply_parameters: { message_id: replyId },
    })
  })
}

export default setupUsersCommands
