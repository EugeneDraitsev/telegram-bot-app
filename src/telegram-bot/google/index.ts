import type { Bot } from 'grammy/web'

import { getCommandData } from '@tg-bot/common'
import { searchImage } from './image-search'
import { translate } from './translate'
import { searchYoutube } from './youtube'

const setupGoogleCommands = (bot: Bot) => {
  bot.command('g', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    try {
      const { url, tbUrl } = await searchImage(text)
      return await ctx
        .replyWithPhoto(url, {
          reply_parameters: { message_id: replyId },
        })
        .catch(() =>
          ctx.replyWithPhoto(tbUrl, {
            reply_parameters: { message_id: replyId },
          }),
        )
        .catch(() => {
          ctx.reply(`Can't load ${url} to telegram (tabUrl: ${tbUrl})`, {
            reply_parameters: { message_id: replyId },
          })
        })
    } catch (e) {
      return ctx.reply(e instanceof Error ? e.message : String(e), {
        reply_parameters: { message_id: replyId },
      })
    }
  })

  bot.command('v', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await searchYoutube(text), {
      reply_parameters: { message_id: replyId },
    })
  })

  /*
   Translate commands
   */
  bot.command('t', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text), {
      reply_parameters: { message_id: replyId },
    })
  })

  const translateCommands = [
    ['tb', 'be'],
    ['tr', 'ru'],
    ['tp', 'pl'],
    ['ts', 'sv'],
    ['td', 'de'],
    ['te', 'en'],
  ] as const

  for (const [cmd, lang] of translateCommands) {
    bot.command(cmd, async (ctx) => {
      const { text, replyId } = getCommandData(ctx.message)
      return ctx.reply(await translate(text, lang), {
        reply_parameters: { message_id: replyId },
      })
    })
  }
}

export default setupGoogleCommands
