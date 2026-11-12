import type { Bot } from 'grammy/web'

import { getCommandData, trySendWidget } from '@tg-bot/common'
import { getHoroscope } from './horoscope'
import { getWeather } from './weather'
import { buildWeatherWidgetHtml } from './weather-widget'
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
    const replyId = ctx.message?.message_id || 0
    const { text: reply, weather } = await getWeather(text || 'Минск')
    const widget =
      weather &&
      (await trySendWidget({
        api: ctx.api,
        chat: ctx.chat,
        html: buildWeatherWidgetHtml(weather),
        replyId,
        messageThreadId: ctx.message?.message_thread_id,
      }))

    return (
      widget ||
      ctx.reply(reply, {
        reply_parameters: { message_id: replyId },
        parse_mode: 'HTML',
      })
    )
  })
}

export default setupExternalApisCommands
