import type { Bot, Context } from 'grammy'

import type { ParseModeFlavor } from '@grammyjs/parse-mode'

import { getCommandData } from '@tg-bot/common'
import { getHoroscope } from './horoscope'
import { getWeather } from './weather'
import { searchWiki } from './wiki'

const setupExternalApisCommands = (bot: Bot<ParseModeFlavor<Context>>) => {
  bot.command('w', async (ctx) => {
    const { text } = getCommandData(ctx.message)
    return ctx.reply(await searchWiki(text))
  })

  bot.command('p', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.replyWithHTML(await getHoroscope(text), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.command('f', async (ctx) => {
    const { text } = getCommandData(ctx.message)
    return ctx.replyWithHTML(await getWeather(text || 'Минск'), {
      reply_parameters: { message_id: ctx.message?.message_id || 0 },
    })
  })
}

export default setupExternalApisCommands
