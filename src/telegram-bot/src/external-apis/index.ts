import type { Context, Telegraf } from 'telegraf'

import { checkCommand, getCommandData } from '@tg-bot/common'
import { getHoroscope } from './horoscope'
import { getWeather } from './weather'
import { searchWiki } from './wiki'

const setupExternalApisCommands = (bot: Telegraf<Context>) => {
  bot.hears(checkCommand('/w'), async (ctx) => {
    const { text } = getCommandData(ctx.message)
    return ctx.reply(await searchWiki(text))
  })

  bot.hears(checkCommand('/p'), async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.replyWithHTML(await getHoroscope(text), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.hears(checkCommand('/f'), async (ctx) => {
    const { text } = getCommandData(ctx.message)
    return ctx.replyWithHTML(await getWeather(text || 'Минск'), {
      reply_parameters: { message_id: ctx.message?.message_id },
    })
  })
}

export default setupExternalApisCommands
