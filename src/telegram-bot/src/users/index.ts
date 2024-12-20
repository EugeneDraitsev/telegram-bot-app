import { InputFile } from 'grammy'

import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { Bot, Context } from 'grammy'

import {
  getChatName,
  getCommandData,
  getFormattedChatStatistics,
  getUsersList,
} from '@tg-bot/common'
import { getDailyStatistics } from './daily-statistics'

const setupUsersCommands = (bot: Bot<ParseModeFlavor<Context>>) => {
  bot.command('z', async (ctx) =>
    ctx.reply(await getFormattedChatStatistics(ctx?.chat?.id ?? '')),
  )

  bot.command('s', async (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    const chatName = getChatName(ctx?.chat)
    const chatId = ctx?.chat?.id ?? ''

    const { message, image } = await getDailyStatistics(
      replyId,
      chatId,
      chatName,
    )

    if (image) {
      return ctx.replyWithPhoto(new InputFile(image, 'stats.png'), {
        reply_parameters: { message_id: replyId },
        caption: message,
      })
    }

    return ctx.replyWithHTML(
      `${chatName} chat statistics: https://telegram-bot-ui.vercel.app/chat/${chatId}`,
      {
        reply_parameters: { message_id: replyId },
      },
    )
  })

  bot.command('all', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await getUsersList(ctx.chat?.id ?? '', text), {
      reply_parameters: { message_id: replyId },
    })
  })
}

export default setupUsersCommands
