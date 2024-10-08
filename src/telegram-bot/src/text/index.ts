import type { Context, Telegraf } from 'telegraf'

import { checkCommand, getCommandData } from '@tg-bot/common'
import { throwDice } from './dice'
import { huify } from './huiator'
import { getPrediction } from './magic8ball'
import { puntoSwitcher } from './punto-switcher'
import { yasnyfy } from './yasno'

const setupTextCommands = (bot: Telegraf<Context>) => {
  bot.hears(checkCommand('/h'), (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const huext = huify(text)
    const result =
      text === huext ? 'https://www.youtube.com/watch?v=uEhw8urePQM' : huext
    return ctx.reply(result, {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.hears(checkCommand('/y'), (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const yasno = yasnyfy(text)
    return ctx.replyWithMarkdownV2(yasno, {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.hears(checkCommand('/dice'), (ctx) => {
    const { text } = getCommandData(ctx.message)
    const diceRoll = Number.parseInt(text, 10)
    if (diceRoll) {
      return ctx.replyWithHTML(throwDice(Number.parseInt(text, 10) || 6), {
        reply_parameters: { message_id: ctx.message?.message_id },
      })
    }
    return ctx.replyWithDice()
  })

  bot.hears(checkCommand('/8'), async (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    return ctx.replyWithSticker(getPrediction(), {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.hears(checkCommand('/shrug'), (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    return ctx.replyWithMarkdownV2('`¯\\\\_(ツ)_/¯`', {
      reply_parameters: { message_id: replyId },
    })
  })

  bot.hears(checkCommand('/ps'), (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    return ctx.reply(puntoSwitcher(text), {
      reply_parameters: { message_id: replyId },
    })
  })
}

export default setupTextCommands
