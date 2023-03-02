import type { Context, Telegraf } from 'telegraf'

import { checkCommand, getCommandData } from '@tg-bot/common'
import { searchWiki } from './wiki'
import { getHoroscope } from './horoscope'
import { getWeather } from './weather'

const setupExternalApisCommands = (bot: Telegraf<Context>) => {
  bot.hears(checkCommand('/w'), async (ctx) => {
    const { text } = getCommandData(ctx.message)
    return ctx.reply(await searchWiki(text))
  })

  bot.hears(checkCommand('/p'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.replyWithHTML(await getHoroscope(text), { reply_to_message_id: replyId })
  })

  bot.hears(checkCommand('/f'), async (ctx) => {
    const { text } = getCommandData(ctx.message)
    return ctx.replyWithHTML(await getWeather(text || 'Минск'), {
      reply_to_message_id: ctx.message?.message_id,
    })
  })

  bot.hears(checkCommand('/check'), async (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    return ctx.replyWithPhoto(
      { url: 'https://masha-migrationsverket.deno.dev', filename: 'status.png' },
      { reply_to_message_id: replyId },
    )
  })
}

export default setupExternalApisCommands
