import Telegraf, { Context as ContextMessageUpdate } from 'telegraf'
import { random, noop } from 'lodash'
import fetch from 'node-fetch'

import { ExtraDocument } from 'telegraf/typings/telegram-types' // eslint-disable-line import/no-unresolved, import/extensions, max-len
import { checkCommand, getChatName, isLink } from './utils'
import { Context } from '.'
import { searchImage, searchYoutube } from './core/google'
import { huify, puntoSwitcher, sayThanksForLink, shrugyfy, throwDice, yasnyfy } from './core/text'
import {
  getCurrency,
  getFormattedChatStatistics,
  getHoroscope,
  getPrediction,
  getUsersList,
  getWeather,
  getXRayStats,
  searchWiki,
  translate,
} from './core'

export default (bot: Telegraf<ContextMessageUpdate>): void => {
  bot.hears(isLink, (ctx, next) => {
    if (ctx.message && random(0, 100) > 99.5) {
      ctx.reply(sayThanksForLink(), { reply_to_message_id: ctx.message.message_id })
    }
    next?.()
  })

  bot.hears(checkCommand('/g'), async (ctx: Context) => {
    const { text, replyId } = ctx
    try {
      const { image, url } = await searchImage(text)
      return await ctx
        .replyWithPhoto({ source: image }, { reply_to_message_id: replyId })
        .catch(() => Promise.reject(new Error(`Can't load ${url} to telegram`)))
    } catch (e) {
      return ctx.reply(e.message, { reply_to_message_id: replyId })
    }
  })

  bot.hears(checkCommand('/h'), (ctx: Context) => {
    const huext = huify(ctx.text)
    const result = ctx.text === huext ? 'https://www.youtube.com/watch?v=q5bc4nmDNio' : huext
    return ctx.reply(result, { reply_to_message_id: ctx.replyId })
  })

  bot.hears(checkCommand('/y'), (ctx: Context) => {
    const yasno = yasnyfy(ctx.text)
    return ctx.reply(yasno, { reply_to_message_id: ctx.replyId })
  })

  bot.hears(checkCommand('/c'), async (ctx: Context) => ctx.reply(await getCurrency()))

  bot.hears(checkCommand('/t'), async (ctx: Context) =>
    ctx.reply(await translate(ctx.text), { reply_to_message_id: ctx.replyId }),
  )

  bot.hears(checkCommand('/z'), async (ctx: Context) =>
    ctx.reply(await getFormattedChatStatistics(ctx.chat.id)),
  )

  bot.hears(checkCommand('/s'), async (ctx: Context) => {
    // fetch ssr-render url without await to reduce coldstart
    fetch(`https://telegram-bot-ui.now.sh/chat/${ctx.chat.id}`).catch(noop)
    const chatName = getChatName(ctx.chat)

    return ctx.replyWithHTML(
      `${chatName} chat statistics: https://telegram-bot-ui.now.sh/chat/${ctx.chat.id}`,
      { reply_to_message_id: ctx.replyId },
    )

    // try {
    //   const chatData = await get24hChatStats(ctx.chat.id)
    //   const html = getDailyUsersBarsSvg(chatData)
    //   const svg = sanitizeSvg(html)
    //
    //   const image = await sharp(Buffer.from(svg))
    //     .resize(1200, 400)
    //     .flatten({ background: '#fff' })
    //     .png()
    //     .toBuffer()
    //
    //   return ctx.replyWithPhoto(
    //     {
    //       source: image,
    //       filename: 'stats.png',
    //     },
    //     {
    //       reply_to_message_id: ctx.replyId,
    //       caption: `${chatName} chat statistics: https://telegram-bot-ui.now.sh/chat/${ctx.chat.id}`,
    //     },
    //   )
    // } catch (e) {
    //   return ctx.replyWithHTML(
    //     `${chatName} chat statistics: https://telegram-bot-ui.now.sh/chat/${ctx.chat.id}`,
    //     { reply_to_message_id: ctx.replyId },
    //   )
    // }
  })

  bot.hears(checkCommand('/8'), async (ctx: Context) =>
    ctx.replyWithSticker(getPrediction(), { reply_to_message_id: ctx.replyId }),
  )

  bot.hears(checkCommand('/v'), async (ctx: Context) => ctx.reply(await searchYoutube(ctx.text)))

  bot.hears(checkCommand('/w'), async (ctx: Context) => ctx.reply(await searchWiki(ctx.text)))

  bot.hears(checkCommand('/dice'), (ctx: Context) =>
    ctx.replyWithMarkdown(throwDice(parseInt(ctx.text, 10) || 6), {
      reply_to_message_id: ctx.message.message_id,
    }),
  )

  bot.hears(checkCommand('/p'), async (ctx: Context) =>
    ctx.replyWithHTML(await getHoroscope(ctx.text), { reply_to_message_id: ctx.replyId }),
  )

  bot.hears(checkCommand('/f'), async (ctx: Context) =>
    ctx.replyWithMarkdown(await getWeather(ctx.text || 'Минск'), {
      reply_to_message_id: ctx.message.message_id,
    }),
  )

  bot.hears(checkCommand('/all'), async (ctx: Context) =>
    ctx.reply(await getUsersList(ctx.chat.id, ctx.text), { reply_to_message_id: ctx.replyId }),
  )

  bot.hears(checkCommand('/ps'), (ctx: Context) =>
    ctx.reply(puntoSwitcher(ctx.text), { reply_to_message_id: ctx.replyId }),
  )

  bot.hears(checkCommand('/x'), async (ctx: Context) => {
    const stats = await getXRayStats()
    return ctx.replyWithDocument({ source: stats.image, filename: 'map.png' }, {
      caption: `Browser version available <a href="${stats.url}">here</a>`,
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id,
    } as ExtraDocument)
  })

  bot.hears(checkCommand('/shrug'), (ctx: Context) =>
    ctx.replyWithMarkdown(shrugyfy(), { reply_to_message_id: ctx.replyId }),
  )
}
