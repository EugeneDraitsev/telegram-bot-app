import type { Bot } from 'grammy'

import { getCommandData } from '@tg-bot/common'
import { getHoroscope } from './horoscope'
import { getWeather } from './weather'
import { searchWiki } from './wiki'

const setupExternalApisCommands = (bot: Bot) => {
  bot.command('w', async (ctx) => {
    const { text } = getCommandData(ctx.message)
    return ctx.reply(await searchWiki(text))
  })

  bot.command('p', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(await getHoroscope(text), {
      reply_parameters: { message_id: replyId },
      parse_mode: 'HTML',
    })
  })

  bot.command('f', async (ctx) => {
    const { text } = getCommandData(ctx.message)
    return ctx.reply(await getWeather(text || 'Минск'), {
      reply_parameters: {
        message_id: ctx.message?.message_id || 0,
      },
      parse_mode: 'HTML',
    })
  })
}

export default setupExternalApisCommands
