import type { Context, Telegraf } from 'telegraf'

import { checkCommand, getCommandData } from '@tg-bot/common'
import { searchImage } from './image-search'
import { translate } from './translate'
import { searchYoutube } from './youtube'

const setupGoogleCommands = (bot: Telegraf<Context>) => {
  bot.hears(checkCommand('/g'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    try {
      const { url, tbUrl } = await searchImage(text)
      return await ctx
        .replyWithPhoto({ url, filename: text }, { reply_to_message_id: replyId })
        .catch(() =>
          ctx.replyWithPhoto({ url: tbUrl, filename: text }, { reply_to_message_id: replyId }),
        )
        .catch(() => {
          ctx.reply(`Can't load ${url} to telegram (tabUrl: ${tbUrl})`, {
            reply_to_message_id: replyId,
          })
        })
    } catch (e) {
      return ctx.reply(e.message, { reply_to_message_id: replyId })
    }
  })

  bot.hears(checkCommand('/v'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await searchYoutube(text), { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/t'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text), { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/tb'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'be'), { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/tp'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'pl'), { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/ts'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'sv'), { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/td'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'de'), { reply_to_message_id: replyId })
  })
}

export default setupGoogleCommands
