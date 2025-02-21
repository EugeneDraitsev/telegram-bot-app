import type { ParseModeFlavor } from '@grammyjs/parse-mode'
import type { Bot, Context } from 'grammy'

import { getCommandData } from '@tg-bot/common'
import { generateCompletion } from './gemini'
import { searchImage } from './image-search'
import { translate } from './translate'
import { searchYoutube } from './youtube'

const setupGoogleCommands = (bot: Bot<ParseModeFlavor<Context>>) => {
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
      return ctx.reply(e.message, {
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

  bot.command('qq', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const chatId = ctx?.chat?.id ?? ''

    const message = await generateCompletion(text, chatId)

    return ctx
      .replyWithMarkdownV2(message?.replace(/([-_\[\]()~>#+={}.!])/g, '\\$1'), {
        reply_parameters: { message_id: replyId },
      })
      .catch((err) => {
        console.error(err)
        return ctx.reply(message, { reply_parameters: { message_id: replyId } })
      })
      .catch((err) => {
        console.error(`Error (Gemini AI): ${err.message}`)
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

  bot.command('tb', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'be'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('tr', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'ru'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('tp', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'pl'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('ts', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'sv'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('td', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'de'), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('te', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await translate(text, 'en'), {
      reply_parameters: { message_id: replyId },
    })
  })
}

export default setupGoogleCommands
